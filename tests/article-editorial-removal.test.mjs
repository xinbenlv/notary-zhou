/** Regression fixtures for the Chinese-only editorial boundary in generated HTML. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { checkArticleSeo } from '../scripts/check-article-seo.mjs';

const origin = 'https://www.notaryzhou.com';
const slugs = Array.from({ length: 31 }, (_, i) => `guide-${i + 1}`);
const paths = ['/articles/', '/articles/topics/apostille/', ...slugs.map(slug => `/articles/${slug}/`)];
const page = (path, extra = '') => `<html lang="${path.startsWith('/en/') ? 'en' : 'zh-CN'}"><head><link href="${origin}${path}" rel="canonical"></head><body><main>${extra}</main></body></html>`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'notary-editorial-removal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
  for (const path of [...paths, '/en/', '/en/privacy/', '/en/verify/']) write(`${path}index.html`, page(path));
  write('/articles/sitemap.xml', `<urlset>${paths.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`);
  write('/sitemap-index.xml', `<sitemapindex><sitemap><loc>${origin}/articles/sitemap.xml</loc></sitemap></sitemapindex>`);
  return { root, write, check: () => checkArticleSeo(root, slugs) };
}

test('33 Chinese routes and English service pages remain valid without English editorial output', t => {
  const f = fixture(t);
  f.write('/en/index.html', page('/en/', '<a href="/articles/guide-1/">中文文章</a><link rel="alternate" hreflang="zh" href="https://www.notaryzhou.com/">'));
  assert.deepEqual(f.check(), { errors: [], pageCount: 33, articleCount: 31 });
});

test('English article HTML and the retired sitemap cannot return to the build', t => {
  const f = fixture(t);
  f.write('/en/articles/guide-1/index.html', page('/en/articles/guide-1/'));
  f.write('/en/articles/sitemap.xml', '<urlset/>');
  const errors = f.check().errors.join('\n');
  assert.match(errors, /Removed English article output was rebuilt: \/en\/articles\/guide-1\/index.html/);
  assert.match(errors, /Removed English article output was rebuilt: \/en\/articles\/sitemap.xml/);
});

test('removed links and hreflang are rejected anywhere, including relative and encoded links', t => {
  const f = fixture(t);
  f.write('/privacy/index.html', page('/privacy/', '<a href="https://www.notaryzhou.com/en/articles/guide-1/">old</a>'));
  f.write('/en/verify/index.html', page('/en/verify/', '<a href="../articles/">old</a>'));
  f.write('/articles/guide-1/index.html', page('/articles/guide-1/', '<link href="https://www.notaryzhou.com/%65n/articles/guide-1/" hreflang="en" rel="alternate">'));
  const errors = f.check().errors.join('\n');
  assert.match(errors, /\/privacy\/: link or hreflang targets removed English article/);
  assert.match(errors, /\/en\/verify\/: link or hreflang targets removed English article/);
  assert.match(errors, /Chinese-only editorial page has hreflang language alternatives/);
});

test('English FAQ markup and nested FAQPage JSON-LD are rejected', t => {
  const f = fixture(t);
  f.write('/en/index.html', page('/en/', '<div class="faq-box">FAQ</div><script type="application/ld+json">{"@graph":[{"@type":["FAQPage"]}]}</script>'));
  const errors = f.check().errors.join('\n');
  assert.match(errors, /FAQ section remains/);
  assert.match(errors, /FAQPage structured data remains/);
});

test('missing Chinese articles, missing English service pages and stale sitemap URLs fail', t => {
  const f = fixture(t);
  rmSync(join(f.root, '/articles/guide-1/index.html'));
  rmSync(join(f.root, '/en/privacy/index.html'));
  f.write('/sitemap-index.xml', `<sitemapindex><loc>${origin}/articles/sitemap.xml</loc><loc>${origin}/en/articles/sitemap.xml</loc></sitemapindex>`);
  const errors = f.check().errors.join('\n');
  assert.match(errors, /Chinese article routes differ/);
  assert.match(errors, /English service page was removed: \/en\/privacy\//);
  assert.match(errors, /Sitemap still advertises removed English articles/);
});
