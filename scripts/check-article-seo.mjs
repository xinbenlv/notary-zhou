/** Verify built multilingual discovery: canonical, reciprocal hreflang, links and scoped sitemaps. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = existsSync('dist/client') ? 'dist/client' : 'dist';
const origin = 'https://www.notaryzhou.com';
const errors = [];
const paths = [];
function walk(dir, prefix) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
    else if (entry.name === 'index.html') paths.push(prefix);
  }
}
for (const prefix of ['/articles/', '/en/articles/']) walk(join(root, prefix), prefix);
const htmlByPath = new Map(paths.map(path => [path, readFileSync(join(root, path, 'index.html'), 'utf8')]));
const canonical = html => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
const alternates = html => new Map([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]));
let pairs = 0;
for (const [path, html] of htmlByPath) {
  const fail = message => errors.push(`${path}: ${message}`);
  if (canonical(html) !== origin + path) fail('canonical is not the page itself');
  if (/name="robots" content="[^"]*noindex/.test(html)) fail('published page is noindex');
  const en = path.startsWith('/en/');
  if (!html.includes(`<html lang="${en ? 'en' : 'zh-CN'}"`)) fail('document language mismatch');
  const alts = alternates(html);
  if (alts.size) {
    if (alts.get(en ? 'en' : 'zh') !== origin + path) fail('hreflang omits self');
    for (const [language, url] of alts) {
      if (!url.startsWith(origin + '/')) { fail('alternate is not an absolute site URL'); continue; }
      const target = htmlByPath.get(new URL(url).pathname);
      if (!target || canonical(target) !== url) fail(`alternate missing or noncanonical: ${url}`);
      if (target && JSON.stringify([...alternates(target)]) !== JSON.stringify([...alts])) fail(`alternate does not reciprocate: ${language}`);
    }
    if (en && html.includes('class="article-body"')) pairs++;
  }
  const match = html.match(/<article class="article-body"[^>]*>([\s\S]*?)<\/article>/);
  if (match && !html.includes('class="references"')) fail('missing source disclosure');
  // Follow internal document links, including source fragments. Ignore SSR routes outside article scope.
  for (const m of html.matchAll(/href="((?:\/en)?\/articles\/[^"?#]*)(#[^"]+)?"/g)) {
    const target = htmlByPath.get(m[1]);
    if (!target) { fail(`broken article link ${m[1]}`); continue; }
    if (m[2] && !target.includes(`id="${m[2].slice(1)}"`)) fail(`missing linked fragment ${m[1]}${m[2]}`);
  }
}
for (const prefix of ['/articles/', '/en/articles/']) {
  const xml = readFileSync(join(root, prefix, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  const expected = paths.filter(p => p.startsWith(prefix)).map(p => origin + p).sort();
  if (new Set(urls).size !== urls.length || JSON.stringify(urls.sort()) !== JSON.stringify(expected)) errors.push(`${prefix}sitemap.xml: missing, duplicate or out-of-scope URL`);
}
for (const path of ['/README/', '/en/README/']) if (existsSync(join(root, path, 'index.html'))) errors.push(`Developer README became a public route: ${path}`);
const index = readFileSync(join(root, 'sitemap-index.xml'), 'utf8');
for (const prefix of ['/articles/', '/en/articles/']) if (!index.includes(`${origin}${prefix}sitemap.xml`)) errors.push(`sitemap index omits ${prefix}`);
if (!pairs) errors.push('No paired English articles were built');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`✓ ${paths.length} article/directory pages; ${pairs} article translation pairs; canonical, hreflang, internal links and both sitemaps passed`);
