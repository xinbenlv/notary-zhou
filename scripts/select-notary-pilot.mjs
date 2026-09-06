// Reproducible editorial shortlist; scores are heuristics, never search-volume estimates.
import { mkdir, writeFile } from 'node:fs/promises';
import { buildNotarySnapshot, NOTARY_LISTING_URL } from '../src/lib/notary-public-listing.mjs';
import { toProfile } from '../src/lib/notary-profile.mjs';

const response = await fetch(NOTARY_LISTING_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Official listing HTTP ${response.status}`);
const snapshot = buildNotarySnapshot(await response.arrayBuffer());
if (!snapshot.source.generatedAt) throw new Error('Official source date is required');
const records = snapshot.rows.map(row => {
  const [name, businessName, city, state, zipCode, countyNumber, commissionNumber, expirationDate] = row.split('\t');
  return toProfile({ name, businessName: businessName || null, city, state, zipCode, countyNumber, commissionNumber, expirationDate });
});
const normalized = name => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nameCounts = new Map();
for (const record of records) {
  const key = normalized(record.displayName);
  nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
}
const stableUntil = new Date(new Date(snapshot.source.generatedAt).valueOf() + 180 * 86400_000).toISOString().slice(0, 10);
const candidates = records.flatMap(record => {
  const name = normalized(record.displayName);
  if (record.state !== 'CA' || !record.city || !record.county || record.expirationDate < stableUntil || nameCounts.get(name) !== 1) return [];
  const tokens = name.split(' ');
  if (tokens.length < 2 || tokens.length > 5) return [];
  const business = normalized(record.businessName || '');
  if (!/\b(notary|notaries|notarial|notarization|signing)\b/.test(business)) return [];
  const businessWords = new Set(business.split(' '));
  const brandedName = tokens.filter(token => token.length > 2 && businessWords.has(token)).length;
  const score = (brandedName >= 2 ? 8 : brandedName === 1 ? 4 : 0)
    + (/\b(notary|notaries|notarial|notarization)\b/.test(business) ? 3 : 0)
    + (/\bmobile\b/.test(business) ? 1 : 0);
  return [{ ...record, score, rationale: `${brandedName ? 'Name appears in business name; ' : ''}notary/signing business; unique listed full name; commission has at least 180 days remaining` }];
}).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName, 'en') || a.commissionNumber.localeCompare(b.commissionNumber));

// Include the site owner's independently sourced record; then diversify the pilot.
const owner = records.find(record => record.commissionNumber === '2557299');
if (!owner || owner.expirationDate < stableUntil) throw new Error('Site owner record needs review');
const selected = [{ ...owner, score: null, rationale: 'Site owner: existing site context and verified commission record' }];
const cityCounts = new Map([[owner.city.toLowerCase(), 1]]);
const countyCounts = new Map([[owner.county, 1]]);
for (const record of candidates) {
  if (record.commissionNumber === owner.commissionNumber) continue;
  const city = record.city.toLowerCase();
  if ((cityCounts.get(city) || 0) >= 5 || (countyCounts.get(record.county) || 0) >= 20) continue;
  selected.push(record);
  cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  countyCounts.set(record.county, (countyCounts.get(record.county) || 0) + 1);
  if (selected.length === 100) break;
}
if (selected.length !== 100) throw new Error(`Only ${selected.length} qualifying records: review criteria before publishing`);
const manifest = {
  selectedAt: new Date().toISOString(),
  sourceGeneratedAt: snapshot.source.generatedAt,
  sourceSha256: snapshot.source.sha256,
  methodology: 'Editorial pilot of 100 real records, based on business relevance, identifiable names, record completeness and city coverage. No search-volume data was used. This is not a popularity or quality ranking.',
  commissionNumbers: selected.map(record => record.commissionNumber),
};
await mkdir('reports', { recursive: true });
await writeFile('src/data/notary-sitemap-pilot.json', JSON.stringify(manifest, null, 2) + '\n');
const columns = ['displayName','commissionNumber','city','county','businessName','expirationDate','rationale'];
const csv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
await writeFile('reports/notary-sitemap-pilot.csv', [columns.join(','), ...selected.map(record => columns.map(column => csv(record[column])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ selected: selected.length, eligible: candidates.length, cities: cityCounts.size, counties: countyCounts.size, sample: selected.slice(0, 12).map(({displayName, city, businessName}) => ({displayName,city,businessName})) }, null, 2));
