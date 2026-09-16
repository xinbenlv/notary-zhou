// 计费规则必须由服务端从 typeKey 查出，绝不能采信请求里的 rule。
// 这组测试守的就是这条线：它一旦失守，任何人都能把公证费改成 $0。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOC_TYPES, ruleFor, needsAct, docType } from '../src/lib/booking/doctypes.ts';
import { notaryFeeCents, serviceMinutes } from '../src/lib/booking/pricing.ts';
import { parseDocs } from '../src/pages/api/quote.ts';

const signer = (name, count = 1) => ({ name, count });
const ok = (r) => { assert.ok(!('error' in r), `期望通过，实际：${r.error}`); return r.docs; };

test('目录里每个 key 都能查到规则，未知 key 返回 undefined', () => {
  for (const t of DOC_TYPES) assert.equal(ruleFor(t.key), t.rule);
  assert.equal(ruleFor('grant_deed__'), undefined);
  assert.equal(ruleFor(''), undefined);
  assert.equal(docType('nope'), undefined);
});

test('核证副本与庭外取证不需要客户再选 ack / jurat', () => {
  assert.equal(needsAct('copy'), false);
  assert.equal(needsAct('depo'), false);
  assert.equal(needsAct('standard'), true);
  assert.equal(needsAct('free'), true);
  assert.equal(needsAct('imm'), true);
});

test('伪造 rule=free 不能把地契的公证费刷成 0', () => {
  const docs = ok(parseDocs([
    { typeKey: 'grant_deed', rule: 'free', act: 'ack', parts: [signer('WEI ZHANG'), signer('LI WANG')] },
  ]));
  assert.equal(docs[0].rule, 'standard');           // 规则来自目录，不是请求
  assert.equal(notaryFeeCents(docs), 3000);         // $15 × 2 签名处
});

test('伪造 rule=standard 也不能给依法免费的文件收钱', () => {
  const docs = ok(parseDocs([
    { typeKey: 'vbm', rule: 'standard', act: 'ack', parts: [signer('WEI ZHANG')] },
  ]));
  assert.equal(docs[0].rule, 'free');
  assert.equal(notaryFeeCents(docs), 0);
});

test('未知或缺失的 typeKey 直接拒绝，不兜底成 standard', () => {
  for (const bad of [[{ typeKey: 'ceo_special', act: 'ack', parts: [signer('A')] }],
                     [{ rule: 'standard', act: 'ack', parts: [signer('A')] }],
                     [{ typeKey: 123, act: 'ack', parts: [signer('A')] }]]) {
    const r = parseDocs(bad);
    assert.ok('error' in r, `应当被拒绝：${JSON.stringify(bad)}`);
  }
});

test('「不确定」的公证类型不可下单', () => {
  for (const act of ['unsure', '', undefined, 'ACK']) {
    const r = parseDocs([{ typeKey: 'poa', act, parts: [signer('A')] }]);
    assert.ok('error' in r, `act=${act} 应当被拒绝`);
  }
  assert.ok(!('error' in parseDocs([{ typeKey: 'poa', act: 'jurat', parts: [signer('A')] }])));
});

test('核证副本无需签署人，其余类型必须至少一位', () => {
  assert.ok(!('error' in parseDocs([{ typeKey: 'poa_copy', parts: [] }])));
  assert.ok('error' in parseDocs([{ typeKey: 'poa', act: 'ack', parts: [] }]));
});

test('签名处数被钳制在 1–10，非法值退回 1', () => {
  const docs = ok(parseDocs([
    { typeKey: 'poa', act: 'ack', parts: [signer('A', 0), signer('B', 999), signer('C', NaN), signer('D', 2.7)] },
  ]));
  assert.deepEqual(docs[0].parts.map((p) => p.count), [1, 10, 1, 2]);
});

test('移民表格按人封顶 $15，与签名处数无关', () => {
  const docs = ok(parseDocs([
    { typeKey: 'imm', act: 'ack', parts: [signer('A', 4), signer('B', 3)] },
  ]));
  assert.equal(notaryFeeCents(docs), 3000);         // 2 人 × $15
  assert.equal(serviceMinutes(docs), 45);           // 但 7 个签名处仍占 45 分钟
});

test('文件数与签署人数有上限', () => {
  const one = { typeKey: 'poa', act: 'ack', parts: [signer('A')] };
  assert.ok('error' in parseDocs(Array(21).fill(one)));
  assert.ok('error' in parseDocs([{ typeKey: 'poa', act: 'ack', parts: Array(11).fill(signer('A')) }]));
  assert.ok('error' in parseDocs([]));
  assert.ok('error' in parseDocs('not an array'));
});
