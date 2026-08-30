// Railway 上托管 Astro 静态构建产物（dist/）的零依赖静态服务器。
// 不引入 npm 依赖，避免与仓库内另一个服务（公证员名单 API）的 package.json 冲突。
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const ROOT = resolve('dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

async function fileAt(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? p : null;
  } catch {
    return null;
  }
}

// 依次尝试：原路径 → 目录下的 index.html → 同名 .html
async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const base = resolve(join(ROOT, clean));
  if (!base.startsWith(ROOT)) return null;                 // 防目录穿越
  return (await fileAt(base))
    || (await fileAt(join(base, 'index.html')))
    || (await fileAt(base + '.html'));
}

function cacheFor(file) {
  // Astro 给 /_astro/ 下的资源加了内容哈希，可长期缓存；HTML 每次校验
  if (file.includes('/_astro/')) return 'public, max-age=31536000, immutable';
  if (file.endsWith('.html')) return 'public, max-age=0, must-revalidate';
  return 'public, max-age=3600';
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }

  let file = await resolveFile(req.url || '/');
  let status = 200;
  if (!file) {
    status = 404;
    file = await fileAt(join(ROOT, '404.html'));
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
  }

  res.writeHead(status, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheFor(file),
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`static server: serving ${ROOT} on :${PORT}`);
});
