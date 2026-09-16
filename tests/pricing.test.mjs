import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docActs, docFeeCents, notaryFeeCents, serviceMinutes, travelRawCents,
  quote, blockWindow, refundTier, refundCents, NOTARY_FEE_CENTS,
} from '../src/lib/booking/pricing.ts';

const std = (parts) => ({ typeKey: 'grant_deed', rule: 'standard', act: 'ack', parts });
const p = (name, count = 1) => ({ name, count });

test('每个签名处 $15（§8211 上限）', () => {
  assert.equal(docFeeCents(std([p('WEI ZHANG')])), 1500);
  assert.equal(docFeeCents(std([p('WEI ZHANG'), p('LI NA')])), 3000);
});

test('同一人在一份文件上签两处按两次计（双重身份）', () => {
  const doc = std([p('WEI ZHANG', 2)]);
  assert.equal(docActs(doc), 2);
  assert.equal(docFeeCents(doc), 3000);
});

test('依法免收的文件计 0，但仍占用服务时长', () => {
  const vet = { typeKey: 'vet', rule: 'free', act: 'ack', parts: [p('LI NA')] };
  assert.equal(docFeeCents(vet), 0);
  assert.equal(docActs(vet), 1, '免费文件仍是一次公证行为');
  assert.equal(serviceMinutes([vet]), 15);
});

test('移民表格每人封顶 $15，与签名处数无关', () => {
  const imm = { typeKey: 'imm', rule: 'imm', act: 'ack', parts: [p('A', 3), p('B', 2)] };
  assert.equal(docActs(imm), 5);
  assert.equal(docFeeCents(imm), 3000, '两个人 → $30，而非 5×$15');
});

test('庭外取证：$30 + 宣誓 $7 + 证书 $7', () => {
  assert.equal(docFeeCents({ typeKey: 'depo', rule: 'depo', parts: [] }), 4400);
});

test('服务时长：每 3 个签名处 15 分钟，向上取整', () => {
  assert.equal(serviceMinutes([std([p('A')])]), 15);
  assert.equal(serviceMinutes([std([p('A', 3)])]), 15);
  assert.equal(serviceMinutes([std([p('A', 4)])]), 30);
  assert.equal(serviceMinutes([std([p('A', 7)])]), 45);
});

test('交通费按往返分钟数；自取为 0', () => {
  assert.equal(travelRawCents(0, 0), 0);
  assert.equal(travelRawCents(28, 28), 500 + 215 * 56);
});

test('自取（Lakewood Park）不上浮手续费——公证费不得超过法定上限', () => {
  const q = quote([std([p('A')])], 0, 0);
  assert.equal(q.travelFeeCents, 0);
  assert.equal(q.notaryFeeCents, NOTARY_FEE_CENTS);
  assert.equal(q.totalCents, NOTARY_FEE_CENTS, '总额必须恰好是 $15，不能因手续费变成 $20');
});

test('上门时手续费与取整全部落在交通费行，公证费行保持法定值', () => {
  const q = quote([std([p('A'), p('B')])], 28, 28);
  assert.equal(q.notaryFeeCents, 3000, '公证费必须恰好 2×$15');
  assert.equal(q.totalCents % 500, 0, '总额取整到 $5');
  assert.equal(q.notaryFeeCents + q.travelFeeCents, q.totalCents);
  assert.ok(q.travelFeeCents > travelRawCents(28, 28), '交通费行吸收了手续费上浮');
});

test('占用窗口：提前 15 分到达，结束后 15 分才出发', () => {
  const t = new Date('2026-09-10T21:00:00Z');
  const { from, to } = blockWindow(t, 15, 25, 31);
  assert.equal(from.toISOString(), '2026-09-10T20:20:00.000Z', 'T − 25 − 15');
  assert.equal(to.toISOString(), '2026-09-10T22:01:00.000Z', 'T + 15 + 15 + 31');
});

test('退款三档', () => {
  const t = new Date('2026-09-10T00:00:00Z');
  const at = (h) => new Date(t.getTime() - h * 3_600_000);
  assert.equal(refundTier(t, at(72)), 'full');
  assert.equal(refundTier(t, at(48)), 'full');
  assert.equal(refundTier(t, at(36)), 'half_travel');
  assert.equal(refundTier(t, at(12)), 'notary_only');
  assert.equal(refundTier(t, new Date(t.getTime() + 3_600_000)), 'notary_only', '爽约');
});

test('退款金额按各档计算', () => {
  const paid = { notaryFeeCents: 3000, travelFeeCents: 12000 };
  assert.equal(refundCents(paid, 'full'), 15000);
  assert.equal(refundCents(paid, 'half_travel'), 9000);
  assert.equal(refundCents(paid, 'notary_only'), 3000);
});

test('多份文件合计', () => {
  const docs = [
    std([p('WEI ZHANG'), p('LI NA')]),
    { typeKey: 'vet', rule: 'free', act: 'ack', parts: [p('LI NA')] },
  ];
  assert.equal(notaryFeeCents(docs), 3000, '免费那份不计费');
  assert.equal(serviceMinutes(docs), 15, '3 个签名处 → 15 分钟');
});
