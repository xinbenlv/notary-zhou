import { createServer } from 'node:http';
import { createNotaryListingService } from '../src/lib/notary-public-listing.mjs';

const port = Number(process.env.PORT ?? process.env.NOTARY_LISTING_PORT ?? 8787);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT or NOTARY_LISTING_PORT must be a valid TCP port');
}

const listing = createNotaryListingService();
await listing.start();

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Accept, Content-Type',
    'cross-origin-resource-policy': 'cross-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow',
  });
  response.end(payload);
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Accept, Content-Type',
        'access-control-max-age': '86400',
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/') {
      sendJson(response, 200, {
        service: 'Notary Zhou California active-notary lookup API',
        endpoints: ['/health', '/search?name=...', '/search?commissionNumber=...'],
        officialSource: 'https://www.sos.ca.gov/notary/notary-public-listing',
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, listing.getStatus());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/search') {
      const commissionNumber = url.searchParams.get('commissionNumber')?.trim();
      const name = url.searchParams.get('name')?.trim();
      if (!commissionNumber && !name) {
        sendJson(response, 400, { error: 'Provide commissionNumber or name' });
        return;
      }

      const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
      const limit = Number.isSafeInteger(requestedLimit) ? requestedLimit : 20;
      const results = listing.search({
        commissionNumber: commissionNumber || undefined,
        name: name || undefined,
        limit,
      });
      sendJson(response, 200, {
        results,
        source: listing.getStatus().source,
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[notary-listing] request failed', error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  const status = listing.getStatus();
  console.info(
    `[notary-listing] listening on http://0.0.0.0:${port}; ` +
      `next refresh ${status.nextRefreshAt}`,
  );
});

function shutDown(signal) {
  console.info(`[notary-listing] received ${signal}; shutting down`);
  listing.stop();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutDown('SIGINT'));
process.once('SIGTERM', () => shutDown('SIGTERM'));
