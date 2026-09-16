import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pacificTime, pacificDateStr, pacificHour, overlaps, candidateSlots, SLOT_HOURS,
  MIN_NOTICE_HOURS, MAX_ADVANCE_DAYS,
} from '../src/lib/booking/schedule.ts';

test('夏令时期间（PDT, UTC-7）9 点 = 16:00Z', () => {
  assert.equal(pacificTime('2026-09-10', 9).toISOString(), '2026-09-10T16:00:00.000Z');
});

test('标准时期间（PST, UTC-8）9 点 = 17:00Z', () => {
  assert.equal(pacificTime('2026-12-10', 9).toISOString(), '2026-12-10T17:00:00.000Z');
});

test('夏令时结束当天（2026-11-01）仍换算正确', () => {
  // 切换发生在当地 2:00 回拨到 1:00；9 点已在 PST
  assert.equal(pacificTime('2026-11-01', 9).toISOString(), '2026-11-01T17:00:00.000Z');
  // 切换前一天仍是 PDT
  assert.equal(pacificTime('2026-10-31', 9).toISOString(), '2026-10-31T16:00:00.000Z');
});

test('夏令时开始当天（2026-03-08）换算正确', () => {
  // 当地 2:00 跳到 3:00；9 点已在 PDT
  assert.equal(pacificTime('2026-03-08', 9).toISOString(), '2026-03-08T16:00:00.000Z');
  assert.equal(pacificTime('2026-03-07', 9).toISOString(), '2026-03-07T17:00:00.000Z');
});

test('往返换算自洽', () => {
  for (const d of ['2026-03-08', '2026-07-04', '2026-11-01', '2026-12-25']) {
    for (const h of SLOT_HOURS) {
      const t = pacificTime(d, h);
      assert.equal(pacificDateStr(t), d, `${d} ${h}点 的日期应还原`);
      assert.equal(pacificHour(t), h, `${d} ${h}点 的小时应还原`);
    }
  }
});

test('区间重叠：端点相接不算重叠', () => {
  const iv = (a, b) => ({ start: new Date(a), end: new Date(b) });
  assert.equal(overlaps(iv('2026-09-10T16:00Z', '2026-09-10T17:00Z'),
                        iv('2026-09-10T17:00Z', '2026-09-10T18:00Z')), false, '首尾相接可连排');
  assert.equal(overlaps(iv('2026-09-10T16:00Z', '2026-09-10T17:00Z'),
                        iv('2026-09-10T16:30Z', '2026-09-10T17:30Z')), true);
  assert.equal(overlaps(iv('2026-09-10T16:00Z', '2026-09-10T18:00Z'),
                        iv('2026-09-10T16:30Z', '2026-09-10T17:00Z')), true, '完全包含');
});

test('候选时段排除过近的（最短提前量 48 小时）', () => {
  const now = new Date('2026-09-10T16:00:00Z');   // 太平洋 9:00 周四
  assert.equal(candidateSlots('2026-09-10', now).length, 0, '当天不可约');
  assert.equal(candidateSlots('2026-09-11', now).length, 0, '次日不可约');

  // 48 小时后正好是 9/12 太平洋 9:00
  const hours = candidateSlots('2026-09-12', now).map((s) => pacificHour(s));
  assert.ok(hours.includes(9), '刚好 48 小时后可约');
  assert.ok(!hours.includes(8), '48 小时之前的时段不出现');
  assert.ok(hours.includes(18));
});

test('候选时段排除过远的（最长提前期 7 天）', () => {
  const now = new Date('2026-09-10T16:00:00Z');
  const last = candidateSlots('2026-09-17', now).map((s) => pacificHour(s));
  assert.ok(last.includes(9), '第 7 天上午仍在窗口内');
  assert.ok(!last.includes(10), '超过 7×24 小时的时段被排除');
  assert.equal(candidateSlots('2026-09-18', now).length, 0, '第 8 天完全不开放');
});

// 这条守的是收款，不是排期：预授权 7 天到期后资金自动释放，
// 预约却还留在日历上。放宽窗口必须连带改成「存卡 + 临近再授权」。
test('最长提前期不得超过预授权有效期（7 天）', () => {
  assert.ok(MAX_ADVANCE_DAYS <= 7,
    `MAX_ADVANCE_DAYS=${MAX_ADVANCE_DAYS} 超过了刷卡预授权的 7 天有效期`);
  assert.ok(MIN_NOTICE_HOURS >= 48,
    '最短提前量低于 48 小时会让新单直接落进部分扣款的退款档');
});
