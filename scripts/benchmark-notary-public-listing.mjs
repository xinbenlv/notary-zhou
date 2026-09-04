import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  createNotaryListingService,
  NOTARY_LISTING_URL,
} from '../src/lib/notary-public-listing.mjs';

const fileArgumentIndex = process.argv.indexOf('--file');
const localFile = fileArgumentIndex === -1 ? null : process.argv[fileArgumentIndex + 1];

if (globalThis.gc) globalThis.gc();
const memoryBefore = process.memoryUsage();
const startedAt = performance.now();

let service;

if (localFile) {
  const zip = await readFile(localFile);
  service = createNotaryListingService({
    fetch: async () => new Response(zip, { status: 200 }),
    logger: { info() {}, error: console.error },
  });
} else {
  service = createNotaryListingService({
    logger: { info() {}, error: console.error },
  });
}

const snapshot = await service.start();
const scheduledStatus = service.getStatus();
const loadedAt = performance.now();
const searchStartedAt = performance.now();
const byCommission = service.search({ commissionNumber: '2557299' });
const byName = service.search({ name: 'Guojin Zhou', limit: 20 });
const searchMs = performance.now() - searchStartedAt;
if (globalThis.gc) globalThis.gc();
const memoryAfter = process.memoryUsage();

console.log(
  JSON.stringify(
    {
      source: localFile ?? NOTARY_LISTING_URL,
      totalMeasuredMs: loadedAt - startedAt,
      metrics: snapshot.metrics,
      generatedAt: snapshot.source.generatedAt,
      nextRefreshAt: scheduledStatus.nextRefreshAt,
      sha256: snapshot.source.sha256,
      memory: {
        heapUsedBefore: memoryBefore.heapUsed,
        heapUsedAfter: memoryAfter.heapUsed,
        heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
        rssBefore: memoryBefore.rss,
        rssAfter: memoryAfter.rss,
        rssDelta: memoryAfter.rss - memoryBefore.rss,
      },
      search: {
        elapsedMs: searchMs,
        commissionMatches: byCommission,
        nameMatches: byName,
      },
    },
    null,
    2,
  ),
);

service.stop();
