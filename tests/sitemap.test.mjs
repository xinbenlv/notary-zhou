import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sitemapUrlset } from '../src/lib/sitemap.mjs';
import { profilePath } from '../src/lib/notary-profile.mjs';

test('pilot has exactly 100 distinct, canonical commission IDs and records its limitations', () => {
  const pilot = JSON.parse(readFileSync(new URL('../src/data/notary-sitemap-pilot.json', import.meta.url)));
  assert.equal(pilot.commissionNumbers.length, 100);
  assert.equal(new Set(pilot.commissionNumbers).size, 100);
  assert.ok(pilot.commissionNumbers.includes('2557299'));
  assert.match(pilot.methodology, /No search-volume data/);
  for (const id of pilot.commissionNumbers) assert.match(profilePath(id), /^\/en\/notaries\/[1-9]\d*\/$/);
});

test('zero priority is preserved and URL/image XML characters are escaped', () => {
  const xml = sitemapUrlset([{url:'https://example.com/a?x=1&y=2',priority:0,image:'https://example.com/image?a=1&b=2'}]);
  assert.match(xml, /<priority>0\.0<\/priority>/);
  assert.match(xml, /x=1&amp;y=2/);
  assert.match(xml, /a=1&amp;b=2/);
  assert.doesNotMatch(xml, /<lastmod>/);
});

test('article date comes from the provided content date without inventing a priority', () => {
  const xml = sitemapUrlset([{url:'https://example.com/articles/example/',lastmod:'2026-08-27'}]);
  assert.match(xml, /<lastmod>2026-08-27<\/lastmod>/);
  assert.doesNotMatch(xml, /<priority>/);
});
