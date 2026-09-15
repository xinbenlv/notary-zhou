/** Verify Chinese-only article discovery and preservation of English service pages. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://www.notaryzhou.com';
const directoryPaths = ['/articles/', '/articles/topics/apostille/'];
const englishServicePaths = ['/en/', '/en/privacy/', '/en/verify/'];
const decode = value => value.replace(/&amp;/g, '&').replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)));
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1].toLowerCase(), decode(m[3])]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attributes(m[0]));
const canonical = html => tags(html, 'link').filter(a => a.rel === 'canonical').map(a => a.href);
const alternates = html => tags(html, 'link').filter(a => a.hreflang);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const retiredPath = path => /^\/en\/articles(?:\/|$)/.test(path);

function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? filesUnder(join(dir, entry.name), `${path}/`) : [path];
  });
}

function localUrl(href, pagePath) {
  try {
    const url = new URL(href, origin + pagePath);
    if (!['www.notaryzhou.com', 'notaryzhou.com'].includes(url.hostname)) return null;
    return { path: decodeURIComponent(url.pathname), fragment: decodeURIComponent(url.hash.slice(1)) };
  } catch { return null; }
}

function containsFaq(value) {
  if (!value || typeof value !== 'object') return false;
  const types = [].concat(value['@type'] || []);
  return types.includes('FAQPage') || Object.values(value).some(item => Array.isArray(item) ? item.some(containsFaq) : containsFaq(item));
}

/** The expected slugs come from published source files; built output cannot silently drop a source. */
export function checkArticleSeo(root, articleSlugs) {
  const errors = [];
  const files = filesUnder(root);
  const expectedPaths = [...directoryPaths, ...articleSlugs.map(slug => `/articles/${slug}/`)];
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  const htmlByPath = new Map(htmlFiles.map(file => [`/${file.replace(/index\.html$/, '')}`, readFileSync(join(root, file), 'utf8')]));
  const paths = [...htmlByPath.keys()].filter(path => path.startsWith('/articles/'));
  if (!same(paths, expectedPaths)) errors.push('Chinese article routes differ from published sources plus the two directory pages');
  if (new Set(expectedPaths).size !== expectedPaths.length) errors.push('Duplicate expected Chinese article routes');
  for (const file of files) {
    if (/^en\/articles(?:\/|$)/.test(file)) errors.push(`Removed English article output was rebuilt: /${file}`);
    if (/sitemap[^/]*\.xml$/.test(file) && /(?:https?:\/\/[^<\s]+)?\/en\/articles(?:\/|<|\s|$)/.test(readFileSync(join(root, file), 'utf8'))) errors.push(`Sitemap still advertises removed English articles: /${file}`);
  }

  // Inspect every generated HTML page: an English article link in a footer or service page is also a regression.
  for (const [path, html] of htmlByPath) {
    const fail = message => errors.push(`${path}: ${message}`);
    for (const tag of html.matchAll(/<[a-z][^>]*\bhref\s*=\s*[^>]*>/gi)) {
      const href = attributes(tag[0]).href;
      const targetUrl = href && localUrl(href, path);
      if (!targetUrl) continue;
      if (retiredPath(targetUrl.path)) { fail(`link or hreflang targets removed English article: ${href}`); continue; }
      if (!targetUrl.path.startsWith('/articles/') || targetUrl.path.endsWith('.xml')) continue;
      const target = htmlByPath.get(targetUrl.path);
      if (!target) { fail(`broken article link ${href}`); continue; }
      if (targetUrl.fragment && !tags(target, '[a-z][\\w:-]*').some(a => a.id === targetUrl.fragment)) fail(`missing linked article fragment ${href}`);
    }
    if (!expectedPaths.includes(path) && !englishServicePaths.includes(path)) continue;
    if (!same(canonical(html), [origin + path])) fail('canonical is not the page itself');
    if (tags(html, 'meta').some(a => /^(robots|googlebot)$/i.test(a.name || '') && /\bnoindex\b/i.test(a.content || ''))) fail('published page is noindex');
    const language = path.startsWith('/en/') ? 'en' : 'zh-CN';
    if (tags(html, 'html')[0]?.lang !== language) fail('document language mismatch');
    if (path.startsWith('/articles/')) {
      if (alternates(html).length) fail('Chinese-only editorial page has hreflang language alternatives');
      if (html.includes('class="article-body"') && !html.includes('class="references"')) fail('missing source disclosure');
    }
  }
  for (const path of englishServicePaths) if (!htmlByPath.has(path)) errors.push(`English service page was removed: ${path}`);
  const englishHome = htmlByPath.get('/en/') || '';
  if (tags(englishHome, '[a-z][\\w:-]*').some(a => /^faq(?:-|$)/i.test(a.id || '') || /(?:^|\s)faq(?:-|\s|$)/i.test(a.class || ''))) errors.push('/en/: FAQ section remains');
  for (const script of englishHome.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attributes(script[1]).type !== 'application/ld+json') continue;
    try { if (containsFaq(JSON.parse(script[2]))) errors.push('/en/: FAQPage structured data remains'); }
    catch { errors.push('/en/: invalid JSON-LD'); }
  }

  const sitemapPath = join(root, 'articles/sitemap.xml');
  if (!existsSync(sitemapPath)) errors.push('/articles/sitemap.xml: missing');
  else {
    const urls = [...readFileSync(sitemapPath, 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(m => decode(m[1]));
    if (new Set(urls).size !== urls.length || !same(urls, expectedPaths.map(path => origin + path))) errors.push('/articles/sitemap.xml: missing, duplicate or out-of-scope URL');
  }
  const indexPath = join(root, 'sitemap-index.xml');
  if (!existsSync(indexPath) || !readFileSync(indexPath, 'utf8').includes(`${origin}/articles/sitemap.xml`)) errors.push('sitemap index omits Chinese articles');
  for (const path of ['/README/', '/en/README/']) if (htmlByPath.has(path)) errors.push(`Developer README became a public route: ${path}`);
  return { errors, pageCount: paths.length, articleCount: articleSlugs.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = existsSync('dist/client') ? 'dist/client' : 'dist';
  const source = 'src/content/articles';
  const articleSlugs = filesUnder(source).filter(file => file.endsWith('.md') && !file.endsWith('README.md') && !/^draft:\s*true\s*$/m.test(readFileSync(join(source, file), 'utf8'))).map(file => file.replace(/\.md$/, ''));
  const result = checkArticleSeo(root, articleSlugs);
  if (result.errors.length) { console.error(result.errors.join('\n')); process.exit(1); }
  console.log(`✓ ${result.pageCount} Chinese article/directory pages (${result.articleCount} articles); canonical, internal links, sitemap and English editorial removal passed`);
}
