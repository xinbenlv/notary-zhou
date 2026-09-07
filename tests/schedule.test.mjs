import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pacificTime, pacificDateStr, pacificHour, overlaps, candidateSlots, SLOT_HOURS,
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

test('候选时段排除过近的（最短提前量）', () => {
  const now = new Date('2026-09-10T16:00:00Z');   // 太平洋 9:00
  const slots = candidateSlots('2026-09-10', now);
  const hours = slots.map((s) => pacificHour(s));
  assert.ok(!hours.includes(9), '当前时刻不可约');
  assert.ok(!hours.includes(11), '3 小时提前量内不可约');
  assert.ok(hours.includes(12), '刚好 3 小时后可约');
  assert.ok(hours.includes(18));
});

test('候选时段排除过远的（最长提前期）', () => {
  const now = new Date('2026-09-10T16:00:00Z');
  assert.equal(candidateSlots('2027-06-01', now).length, 0, '超过 60 天不开放');
});
