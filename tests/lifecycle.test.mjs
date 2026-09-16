// 预授权收尾的判定。这组测试钉住的是「钱已经没了」时系统该怎么反应——
// 判错方向的代价不对称：把到期误判成取消会抹掉一场真实履约的全部痕迹。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCancellation, shouldDropCalendarEvents, captureUrgency,
  canReleasePendingHold, STRIPE_INTERNAL_CANCEL_REASONS,
  CAPTURE_WARN_HOURS, CAPTURE_CRITICAL_HOURS,
} from '../src/lib/booking/lifecycle.ts';

const NOW = new Date('2026-09-16T12:00:00Z');
const inHours = (h) => new Date(NOW.getTime() + h * 3_600_000);

// ── 到期 vs 主动取消 ──────────────────────────────────────────

// Stripe 侧实测：cancellation_reason=automatic 传不进去，
// 会被拒为 "not a valid user provided reason"，所以见到它一定来自 Stripe 自己。
test('automatic：Stripe 自动释放，判为到期而不是取消', () => {
  const v = classifyCancellation({ reason: 'automatic', captureBefore: inHours(48), now: NOW });
  assert.equal(v.kind, 'expired');
  assert.match(v.why, /^authorization_expired:automatic$/);
});

test('expired 也是 Stripe 内部原因，同样判为到期', () => {
  // 官方文档把 failed_invoice / void_invoice / automatic / expired 并列为内部生成，
  // 只认 'automatic' 一个词，哪天换成 'expired' 我们就会重新开始删日历
  assert.equal(classifyCancellation({ reason: 'expired', captureBefore: null, now: NOW }).kind, 'expired');
});

test('四个 Stripe 内部原因一个都不能漏', () => {
  for (const reason of STRIPE_INTERNAL_CANCEL_REASONS) {
    assert.equal(classifyCancellation({ reason, captureBefore: null, now: NOW }).kind, 'expired', reason);
  }
  assert.equal(STRIPE_INTERNAL_CANCEL_REASONS.size, 4);
});

test('requested_by_customer：人主动取消，不能当成到期', () => {
  const v = classifyCancellation({ reason: 'requested_by_customer', captureBefore: inHours(48), now: NOW });
  assert.equal(v.kind, 'cancelled');
  assert.equal(v.why, 'requested_by_customer');
});

// 实测：在 Stripe 后台点 Cancel、不填原因，cancellation_reason 回来是 null
test('后台手动取消（reason 为 null）仍算主动取消', () => {
  const v = classifyCancellation({ reason: null, captureBefore: inHours(48), now: NOW });
  assert.equal(v.kind, 'cancelled');
  assert.equal(v.why, 'stripe_canceled');
});

test('abandoned 是用户侧原因，算主动取消', () => {
  assert.equal(classifyCancellation({ reason: 'abandoned', captureBefore: inHours(1), now: NOW }).kind, 'cancelled');
});

// 第二条独立证据：就算原因字段是空的、或 Stripe 换了个新词，
// 只要我们记下的 capture_before 已经过去，钱在那一刻就已经释放了
test('原因缺失但 capture_before 已过：仍判为到期', () => {
  const v = classifyCancellation({ reason: null, captureBefore: inHours(-1), now: NOW });
  assert.equal(v.kind, 'expired');
  assert.equal(v.why, 'authorization_expired:capture_before_passed');
});

test('capture_before 还没到、原因也不是内部的：判为取消', () => {
  assert.equal(classifyCancellation({ reason: null, captureBefore: inHours(1), now: NOW }).kind, 'cancelled');
});

test('capture_before 为空且原因为空时不瞎猜，按取消处理', () => {
  assert.equal(classifyCancellation({ reason: undefined, captureBefore: undefined, now: NOW }).kind, 'cancelled');
});

// ── 日历事件的去留 ────────────────────────────────────────────

test('还没发生的预约：取消时删掉日历事件', () => {
  assert.equal(shouldDropCalendarEvents(inHours(2), NOW), true);
});

test('已经发生过的预约：绝不删日历事件，那是履约记录', () => {
  // 这正是缺陷 1 最贵的那一半——授权到期时预约基本已经过去了
  assert.equal(shouldDropCalendarEvents(inHours(-2), NOW), false);
});

test('预约时刻正好是此刻：算已经开始，保留事件', () => {
  assert.equal(shouldDropCalendarEvents(NOW, NOW), false);
});

test('7 天授权 + 最长 7 天预约期：到期时预约必然已过，事件必须留下', () => {
  // 下单即预授权，授权 7 天后到期；预约最远只能排到 7 天后（MAX_ADVANCE_DAYS）。
  // 所以"授权到期"这一刻，预约时刻一定不在未来。
  const bookedAtMax = inHours(7 * 24);          // 排在最远的一单
  const authExpires = inHours(7 * 24);          // 授权同时到期
  assert.equal(shouldDropCalendarEvents(bookedAtMax, authExpires), false);
});

// ── 到期紧迫程度 ─────────────────────────────────────────────

test('还剩很久：ok', () => {
  assert.equal(captureUrgency(inHours(120), NOW).level, 'ok');
});

test(`剩 ${CAPTURE_WARN_HOURS} 小时以内：warn`, () => {
  assert.equal(captureUrgency(inHours(CAPTURE_WARN_HOURS - 1), NOW).level, 'warn');
});

test(`剩 ${CAPTURE_CRITICAL_HOURS} 小时以内：critical`, () => {
  assert.equal(captureUrgency(inHours(CAPTURE_CRITICAL_HOURS - 1), NOW).level, 'critical');
});

test('已经过期：expired，且小时数为负', () => {
  const u = captureUrgency(inHours(-3), NOW);
  assert.equal(u.level, 'expired');
  assert.ok(u.hoursLeft < 0);
});

test('阈值边界正好落在较宽的一档', () => {
  assert.equal(captureUrgency(inHours(CAPTURE_WARN_HOURS), NOW).level, 'warn');
  assert.equal(captureUrgency(inHours(CAPTURE_CRITICAL_HOURS), NOW).level, 'critical');
});

test('没有 capture_before 就不报警，缺字段不等于出事', () => {
  const u = captureUrgency(null, NOW);
  assert.equal(u.level, 'ok');
  assert.equal(u.hoursLeft, null);
});

test('剩余小时数保留一位小数', () => {
  assert.equal(captureUrgency(inHours(1.5), NOW).hoursLeft, 1.5);
});

// ── 客户按返回时能不能放掉占位 ────────────────────────────────

test('还没付过钱：可以放掉自己的占位', () => {
  assert.equal(canReleasePendingHold({ status: 'held', paymentIntentId: null }), true);
});

test('已经授权的单绝不能被返回键释放', () => {
  assert.equal(canReleasePendingHold({ status: 'authorized', paymentIntentId: 'pi_1' }), false);
});

test('库里还是 held、但已经有 payment_intent：不放', () => {
  assert.equal(canReleasePendingHold({ status: 'held', paymentIntentId: 'pi_1' }), false);
});

// 最危险的一种竞态：另一个标签页已经付完，webhook 还在路上。
// 此刻库里仍是 held、payment_intent_id 仍是空——只有会话状态能揭穿它。
test('会话已 complete（钱已付、webhook 未到）：绝不能放', () => {
  assert.equal(canReleasePendingHold({
    status: 'held', paymentIntentId: null, sessionStatus: 'complete',
  }), false);
});

test('会话上已挂 payment_intent：说明扣款已发起，不放', () => {
  assert.equal(canReleasePendingHold({
    status: 'held', paymentIntentId: null, sessionStatus: 'open', sessionPaymentIntent: 'pi_1',
  }), false);
});

test('会话还开着且没有 payment_intent：这才是真正被放弃的结账', () => {
  assert.equal(canReleasePendingHold({
    status: 'held', paymentIntentId: null, sessionStatus: 'open', sessionPaymentIntent: null,
  }), true);
});

test('会话已过期：位子本来也该放，可以释放', () => {
  // expired 的会话付不了款了，但保守规则要求"非 open 即不放"——
  // 这类单会由 checkout.session.expired 事件收尾，不靠返回键
  assert.equal(canReleasePendingHold({
    status: 'held', paymentIntentId: null, sessionStatus: 'expired',
  }), false);
});
