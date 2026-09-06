export const COUNTY_NAMES = [
  '', 'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa', 'Contra Costa',
  'Del Norte', 'El Dorado', 'Fresno', 'Glenn', 'Humboldt', 'Imperial', 'Inyo', 'Kern',
  'Kings', 'Lake', 'Lassen', 'Los Angeles', 'Madera', 'Marin', 'Mariposa', 'Mendocino',
  'Merced', 'Modoc', 'Mono', 'Monterey', 'Napa', 'Nevada', 'Orange', 'Placer', 'Plumas',
  'Riverside', 'Sacramento', 'San Benito', 'San Bernardino', 'San Diego', 'San Francisco',
  'San Joaquin', 'San Luis Obispo', 'San Mateo', 'Santa Barbara', 'Santa Clara',
  'Santa Cruz', 'Shasta', 'Sierra', 'Siskiyou', 'Solano', 'Sonoma', 'Stanislaus',
  'Sutter', 'Tehama', 'Trinity', 'Tulare', 'Tuolumne', 'Ventura', 'Yolo', 'Yuba',
];
export const PROFILE_PATH = '/en/notaries/';
export const OFFICIAL_SOURCE_PAGE = 'https://www.sos.ca.gov/notary/notary-public-listing';

export function profilePath(commissionNumber) {
  if (!/^[1-9]\d{0,9}$/.test(String(commissionNumber))) throw new Error('Invalid commission number');
  return `${PROFILE_PATH}${commissionNumber}/`;
}

export function nameParts(name) {
  const [family, ...given] = name.normalize('NFKC').toLocaleLowerCase('en-US').split(',');
  return { family: family.trim(), given: given.join(',').trim() };
}

export function relatedMatch(record, candidate) {
  if (record.commissionNumber === candidate.commissionNumber) return null;
  const a = nameParts(record.name), b = nameParts(candidate.name);
  const sameCity = Boolean(record.city) && record.city.toLowerCase() === candidate.city.toLowerCase() && record.state === candidate.state;
  if (a.family === b.family) {
    if (a.given === b.given) return { rank: 5, reason: 'Same name' };
    if (a.given && a.given.split(/\s+/)[0] === b.given.split(/\s+/)[0]) return { rank: 4, reason: 'Similar name' };
    return { rank: sameCity ? 3 : 2, reason: sameCity ? 'Same surname · same city' : 'Same surname' };
  }
  return sameCity ? { rank: 1, reason: 'Same listed city' } : null;
}

export function toProfile(record) {
  const comma = record.name.indexOf(',');
  const displayName = comma < 0 ? record.name : `${record.name.slice(comma + 1).trim()} ${record.name.slice(0, comma).trim()}`;
  const match = record.expirationDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error('Invalid listing expiration date');
  return {
    name: record.name, displayName, businessName: record.businessName,
    city: record.city, state: record.state,
    county: COUNTY_NAMES[Number(record.countyNumber)] || `County code ${record.countyNumber}`,
    commissionNumber: record.commissionNumber,
    expirationDate: `${match[3]}-${match[1]}-${match[2]}`,
  };
}

export function profileMetadata(record, source, site) {
  const path = profilePath(record.commissionNumber);
  const canonical = `${site.url}${path}`;
  const title = `${record.displayName} — California Notary Public in ${record.city || 'California'} | Notary Zhou`;
  const description = `California notary public record for ${record.displayName}. Commission #${record.commissionNumber}, ${record.county} County, listed expiration ${record.expirationDate}. Check the dated official source.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical,
        name: title, description, inLanguage: 'en',
        mainEntity: { '@id': `${canonical}#person` },
        publisher: { '@type': 'Organization', name: site.name, url: site.url },
        citation: OFFICIAL_SOURCE_PAGE,
      },
      {
        '@type': 'Person', '@id': `${canonical}#person`, name: record.displayName,
        alternateName: record.name,
        description: `Named in the California active-notary file generated ${source.generatedAt}, under commission ${record.commissionNumber}.`,
        hasCredential: {
          '@type': 'EducationalOccupationalCredential', name: 'California Notary Public Commission',
          credentialCategory: 'Notary public commission',
          identifier: { '@type': 'PropertyValue', propertyID: 'California notary commission number', value: record.commissionNumber },
        },
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'California notary lookup', item: `${site.url}/en/verify/` },
          { '@type': 'ListItem', position: 2, name: `Commission ${record.commissionNumber}`, item: canonical },
        ],
      },
    ],
  };
  return { path, title, description, jsonLd };
}
