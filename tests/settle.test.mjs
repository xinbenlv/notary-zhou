// 取消时「扣多少」的换算。预授权模式下退款政策不再是退钱，而是少扣，
// 这组测试把三档政策与 Stripe 的最低收款额一起钉住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCancel, STRIPE_MIN_CENTS } from '../src/lib/booking/settle.ts';

// 典型单：公证费 $30（2 签名处）+ 交通费 $85 = $115
const mobile = (startsAt) => ({
  id: 'bk_x', status: 'authorized', starts_at: startsAt,
  notary_fee_cents: 3000, travel_fee_cents: 8500, total_cents: 11500,
  payment_intent_id: 'pi_x', event_id_service: null, event_id_outbound: null, event_id_return: null,
});
// 自取单：只有公证费，没有交通费可扣
const park = (startsAt) => ({ ...mobile(startsAt), travel_fee_cents: 0, total_cents: 3000 });

const NOW = new Date('2026-09-16T12:00:00Z');
const inHours = (h) => new Date(NOW.getTime() + h * 3_600_000);

test('48 小时以上取消：一分不扣，整笔授权释放', () => {
  const p = planCancel(mobile(inHours(72)), NOW);
  assert.equal(p.tier, 'full');
  assert.equal(p.captureCents, 0);
  assert.equal(p.releasedCents, 11500);
});

test('24–48 小时取消：只扣一半交通费，公证费全免', () => {
  const p = planCancel(mobile(inHours(36)), NOW);
  assert.equal(p.tier, 'half_travel');
  assert.equal(p.captureCents, 4250);            // $85 的一半
  assert.equal(p.releasedCents, 7250);           // 公证费 $30 + 另一半交通费
});

test('24 小时内取消：扣全部交通费，公证费仍不收', () => {
  const p = planCancel(mobile(inHours(6)), NOW);
  assert.equal(p.tier, 'notary_only');
  assert.equal(p.captureCents, 8500);
  assert.equal(p.releasedCents, 3000);
});

test('爽约（时间已过）按 24 小时内处理', () => {
  assert.equal(planCancel(mobile(inHours(-2)), NOW).captureCents, 8500);
});

test('档位边界：正好 48 小时算全免，正好 24 小时算半数', () => {
  assert.equal(planCancel(mobile(inHours(48)), NOW).tier, 'full');
  assert.equal(planCancel(mobile(inHours(47.9)), NOW).tier, 'half_travel');
  assert.equal(planCancel(mobile(inHours(24)), NOW).tier, 'half_travel');
  assert.equal(planCancel(mobile(inHours(23.9)), NOW).tier, 'notary_only');
});

test('自取单没有交通费可扣，任何时候取消都是零扣款', () => {
  for (const h of [72, 36, 6, -2]) {
    const p = planCancel(park(inHours(h)), NOW);
    assert.equal(p.captureCents, 0, `${h}h 应当零扣款`);
    assert.equal(p.releasedCents, 3000);
  }
});

test('交通费为奇数分时，一半向上取整落在我们这边', () => {
  const b = { ...mobile(inHours(36)), travel_fee_cents: 8501, total_cents: 11501 };
  // 退款取 floor，所以扣款自然是 ceil —— 零头不能两边都算给客户
  assert.equal(planCancel(b, NOW).captureCents, 4251);
});

test('不足 Stripe 最低收款额时整笔放掉，不强行扣', () => {
  const b = { ...mobile(inHours(6)), travel_fee_cents: 40, total_cents: 3040 };
  const p = planCancel(b, NOW);
  assert.ok(40 < STRIPE_MIN_CENTS);
  assert.equal(p.captureCents, 0, '扣不了的零头按 0 处理');
  assert.equal(p.releasedCents, 3040);
});

test('扣款额永远不超过授权额', () => {
  for (const h of [72, 48, 36, 24, 6, -5]) {
    const b = mobile(inHours(h));
    const p = planCancel(b, NOW);
    assert.ok(p.captureCents <= b.total_cents);
    assert.equal(p.captureCents + p.releasedCents, b.total_cents);
  }
});
