// 巡检告警。这套东西存在的唯一理由，是这几种故障都**不会自己喊人**：
// 授权到期没有事件、Stripe 放弃重试没有事件、订单卡在 held 也没有事件。
// 所以「该报的没报」和「根本没有巡检」是同一种失败。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlerts, STUCK_HELD_HOURS } from '../src/lib/booking/watch.ts';

const none = { expiringSoon: [], expiredUncaptured: [], stuckHeld: [], webhookFailures: [] };

test('什么都没有时不报警', () => {
  assert.deepEqual(buildAlerts(none), []);
});

test('授权快到期：报出订单号、金额和剩余小时数', () => {
  const alerts = buildAlerts({ ...none, expiringSoon: [
    { id: 'bk_abc', totalCents: 11500, hoursLeft: 12.5, level: 'critical',
      startsAt: '2026-09-14T17:00:00.000Z', captureBefore: '2026-09-17T00:30:00.000Z',
      email: 'a@b.c', phone: null },
  ]});
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /bk_abc/);
  assert.match(alerts[0], /\$115\.00/);          // 金额按美元展示，不是分
  assert.match(alerts[0], /12\.5 小时/);
});

test('授权已过期但状态还停在 authorized：措辞要说明钱可能已经释放', () => {
  const alerts = buildAlerts({ ...none, expiringSoon: [
    { id: 'bk_late', totalCents: 3000, hoursLeft: -6, level: 'expired',
      startsAt: '2026-09-08T17:00:00.000Z', captureBefore: '2026-09-16T06:00:00.000Z',
      email: null, phone: null },
  ]});
  assert.match(alerts[0], /已过期/);
  assert.doesNotMatch(alerts[0], /还有/);        // 别说成"还有 -6 小时"
});

test('已经到期未扣款：必须报，这是真丢了的钱', () => {
  const alerts = buildAlerts({ ...none, expiredUncaptured: [
    { id: 'bk_lost', totalCents: 8500, startsAt: '2026-09-09T17:00:00.000Z',
      captureBefore: '2026-09-16T06:00:00.000Z', email: null, phone: null,
      cancelReason: 'authorization_expired:automatic', endedAt: '2026-09-16T06:01:00.000Z' },
  ]});
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /bk_lost/);
  assert.match(alerts[0], /\$85\.00/);
  assert.match(alerts[0], /没有收到/);
});

test('卡在 held 的单要报，那是 webhook 没落地的症状', () => {
  const alerts = buildAlerts({ ...none, stuckHeld: [
    { id: 'bk_stuck', startsAt: '2026-09-18T17:00:00.000Z', createdAt: '2026-09-16T06:00:00.000Z',
      totalCents: 3000, checkoutSessionId: 'cs_test_1' },
  ]});
  assert.match(alerts[0], /bk_stuck/);
  assert.match(alerts[0], new RegExp(`${STUCK_HELD_HOURS} 小时`));
});

// Stripe 重试约三天后放弃，而"放弃"本身不产生任何事件——
// 没有这条告警，一单卡住就永远没人知道
test('未解决的 webhook 失败要报，并带上重试次数与错误', () => {
  const alerts = buildAlerts({ ...none, webhookFailures: [
    { eventId: 'evt_1', type: 'checkout.session.completed', attempts: 7,
      firstFailedAt: '2026-09-13T06:00:00.000Z', lastFailedAt: '2026-09-16T06:00:00.000Z',
      lastError: '订单不存在: bk_x' },
  ]});
  assert.match(alerts[0], /evt_1/);
  assert.match(alerts[0], /checkout\.session\.completed/);
  assert.match(alerts[0], /7 次/);
  assert.match(alerts[0], /订单不存在/);
});

test('错误信息为空也不能崩，仍要报出这条失败', () => {
  const alerts = buildAlerts({ ...none, webhookFailures: [
    { eventId: 'evt_2', type: 'charge.refunded', attempts: 1,
      firstFailedAt: '2026-09-16T06:00:00.000Z', lastFailedAt: '2026-09-16T06:00:00.000Z',
      lastError: null },
  ]});
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /evt_2/);
});

test('多类问题同时出现时全部列出，不能只报第一条', () => {
  const alerts = buildAlerts({
    expiringSoon: [{ id: 'bk_1', totalCents: 1500, hoursLeft: 5, level: 'critical',
      startsAt: 'x', captureBefore: 'y', email: null, phone: null }],
    expiredUncaptured: [{ id: 'bk_2', totalCents: 1500, startsAt: 'x', captureBefore: 'y',
      email: null, phone: null, cancelReason: null, endedAt: 'z' }],
    stuckHeld: [{ id: 'bk_3', startsAt: 'x', createdAt: 'y', totalCents: 1500, checkoutSessionId: null }],
    webhookFailures: [{ eventId: 'evt_3', type: 't', attempts: 2,
      firstFailedAt: 'x', lastFailedAt: 'y', lastError: 'boom' }],
  });
  assert.equal(alerts.length, 4);
  for (const needle of ['bk_1', 'bk_2', 'bk_3', 'evt_3']) {
    assert.ok(alerts.some((a) => a.includes(needle)), `缺少 ${needle}`);
  }
});
