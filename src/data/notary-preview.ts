// Small, address-free preview fixture from the CA SOS public listing.
// This is a dated snapshot for template review, not a live registry or database.
export interface NotaryDetailRecord {
  name: string;
  displayName: string;
  businessName: string | null;
  city: string;
  state: string;
  county: string;
  commissionNumber: string;
  expirationDate: string;
}

export const previewSource = {
  url: 'https://www.sos.ca.gov/notary/notary-public-listing',
  downloadUrl: 'https://notary.cdn.sos.ca.gov/export/active-notary.zip',
  generatedAt: '2026-09-05T06:00:00-07:00',
  retrievedAt: '2026-09-05T17:13:10Z',
};

export const previewRecords: NotaryDetailRecord[] = [
  {
    name: 'Chen, Jeffrey',
    displayName: 'Jeffrey Chen',
    businessName: 'FIDELITY INVESTMENTS',
    city: 'Irvine',
    state: 'CA',
    county: 'Orange',
    commissionNumber: '2455891',
    expirationDate: '2027-07-30',
  },
  {
    name: 'Acevedo Ramirez, Maria Montserrath',
    displayName: 'Maria Montserrath Acevedo Ramirez',
    businessName: null,
    city: 'Manteca',
    state: 'CA',
    county: 'San Joaquin',
    commissionNumber: '2513608',
    expirationDate: '2029-03-04',
  },
  {
    name: 'Zhou, Guojin',
    displayName: 'Guojin Zhou',
    businessName: null,
    city: 'Sunnyvale',
    state: 'CA',
    county: 'Santa Clara',
    commissionNumber: '2557299',
    expirationDate: '2030-05-30',
  },
  {
    name: 'Chen, Jeffrey Andrew',
    displayName: 'Jeffrey Andrew Chen',
    businessName: null,
    city: 'Alamo',
    state: 'CA',
    county: 'Contra Costa',
    commissionNumber: '2517487',
    expirationDate: '2029-05-12',
  },
  {
    name: 'Chen, Katherine',
    displayName: 'Katherine Chen',
    businessName: 'LAW OFFICES OF YVONNE HSU',
    city: 'Irvine',
    state: 'CA',
    county: 'Orange',
    commissionNumber: '2550527',
    expirationDate: '2030-04-04',
  },
  {
    name: 'Chen, Diane D.',
    displayName: 'Diane D. Chen',
    businessName: null,
    city: 'Irvine',
    state: 'CA',
    county: 'Orange',
    commissionNumber: '2495239',
    expirationDate: '2028-08-18',
  },
];

export { notaryCityBounds as previewCityBounds } from './notary-cities';

export function relatedPreviewRecords(record: NotaryDetailRecord) {
  const parts = (name: string) => name.toLocaleLowerCase('en-US').split(',').map((part) => part.trim());
  const [surname, given] = parts(record.name);
  return previewRecords
    .filter((entry) => entry.commissionNumber !== record.commissionNumber)
    .map((entry) => {
      const [otherSurname, otherGiven] = parts(entry.name);
      const sameCity = entry.city === record.city && entry.state === record.state;
      const sameSurname = surname === otherSurname;
      const sameName = sameSurname && given === otherGiven;
      const similarName = sameSurname && given.split(' ')[0] === otherGiven.split(' ')[0];
      return {
        record: entry,
        href: `/en/notaries/preview/?commission=${entry.commissionNumber}`,
        reason: sameName ? 'Same name' : similarName ? 'Similar name' : sameSurname ? (sameCity ? 'Same surname · same city' : 'Same surname') : 'Same listed city',
        rank: sameName ? 4 : similarName ? 3 : sameSurname ? 2 : sameCity ? 1 : 0,
      };
    })
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.record.displayName.localeCompare(b.record.displayName, 'en'))
    .slice(0, 3);
}
