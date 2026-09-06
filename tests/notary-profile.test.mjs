import assert from 'node:assert/strict';
import test from 'node:test';
import { profilePath, relatedMatch, toProfile, profileMetadata } from '../src/lib/notary-profile.mjs';

const record = {name:'Chen, Jeffrey',businessName:null,city:'Irvine',state:'CA',countyNumber:'30',commissionNumber:'2455891',expirationDate:'07/30/2027'};

test('commission paths reject aliases, separators and invalid IDs', () => {
  assert.equal(profilePath('2455891'), '/en/notaries/2455891/');
  for (const id of ['02455891','../preview','1?name=x','1e6','',0,-1]) assert.throws(() => profilePath(id));
});

test('same names remain separate records, ranked above merely local records', () => {
  assert.equal(relatedMatch(record, record), null);
  const exact = relatedMatch(record, {...record,commissionNumber:'2'});
  const similar = relatedMatch(record, {...record,name:'Chen, Jeffrey Andrew',commissionNumber:'3'});
  const local = relatedMatch(record, {...record,name:'Smith, Alice',commissionNumber:'4'});
  assert.equal(exact.reason, 'Same name');
  assert.ok(exact.rank > similar.rank && similar.rank > local.rank);
  assert.equal(relatedMatch(record, {...record,name:'Smith, Alice',city:'Alamo',commissionNumber:'5'}),null);
});

test('shared compound surname is preserved for display and matching', () => {
  const compound = {...record,name:'Acevedo Ramirez, Maria Montserrath'};
  assert.equal(toProfile(compound).displayName,'Maria Montserrath Acevedo Ramirez');
  assert.equal(relatedMatch(compound,{...compound,commissionNumber:'2',name:'Acevedo, Maria'}).reason,'Same listed city');
});

test('profile exposes dated source facts without street addresses or invented employment', () => {
  const profile = toProfile({...record,streetAddress:'PRIVATE ADDRESS'});
  assert.equal(profile.expirationDate,'2027-07-30');
  assert.equal(profile.county,'Orange');
  assert.equal(profile.streetAddress,undefined);
  const metadata=profileMetadata(profile,{generatedAt:'2026-09-05T13:00:00Z'},{url:'https://www.notaryzhou.com',name:'Notary Zhou'});
  const person=metadata.jsonLd['@graph'].find(item=>item['@type']==='Person');
  assert.equal(person.hasCredential.identifier.value,record.commissionNumber);
  assert.equal(person.worksFor,undefined);
  assert.equal(person.image,undefined);
  assert.match(person.description,/2026-09-05/);
});
