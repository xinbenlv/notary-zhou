// 营业时段与时区换算。
//
// 时段按「太平洋时间的整点」定义，但一切存储与比较都用 UTC。
// 不引入 date-fns/luxon：用 Intl 拿到某一时刻的真实时区偏移即可，
// 这样夏令时切换（每年三月/十一月各一次）自动正确，无需维护偏移表。

export const TIMEZONE = 'America/Los_Angeles';

/** 可预约的整点（太平洋时间）。12 点后跳到 14 点是留出午休。 */
export const SLOT_HOURS = [9, 10, 11, 12, 14, 15, 16, 17, 18];

/**
 * 最短提前量 48 小时。
 * 除了留出备料时间，它还让每一单在**下单那一刻**都落在退款政策的第一档
 * （>48h 全额）——也就是说，此时取消永远可以直接撤销预授权，不必部分扣款。
 */
export const MIN_NOTICE_HOURS = 48;

/**
 * 最多可预约到多少天以后。
 *
 * **这个数不能超过 7，否则收款会静默失效。** 网上刷卡的预授权只保留 7 天
 * （Visa / Mastercard / Amex / Discover 同为 7 天），到期资金自动释放、
 * PaymentIntent 变成 canceled——预约还在日历上，钱却已经没了。
 * Stripe 的「延长授权」能到 30 天，但需要 IC+ 计费方案，且 Amex 与 Discover
 * 只对酒店／租车类商户开放，公证不在其中，所以不能依赖。
 * 要放宽到 7 天以上，必须先改成「存卡 + 临近日期再补授权」，不能只改这个常量。
 */
export const MAX_ADVANCE_DAYS = 7;

/** 某一时刻在指定时区的偏移毫秒数（东为正） */
function zoneOffsetMs(at: Date, timeZone = TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
  // Intl 在 24 小时制下会把午夜表示成 24，Date.UTC 需要 0
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return asUTC - at.getTime();
}

/**
 * 把「太平洋时间的某年某月某日某点」转成真实的 UTC 时刻。
 * 先按 UTC 猜一个，再用该时刻的实际偏移修正——夏令时当天偏移会变，
 * 所以要迭代一次；两次之后必然收敛。
 */
export function pacificTime(dateStr: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  for (let i = 0; i < 2; i++) {
    guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0) - zoneOffsetMs(guess));
  }
  return guess;
}

/** 该时刻在太平洋时区的 YYYY-MM-DD */
export function pacificDateStr(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** 该时刻在太平洋时区的小时（0–23） */
export function pacificHour(at: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour12: false, hour: '2-digit' }).format(at);
  return h === '24' ? 0 : Number(h);
}

export interface Interval { start: Date; end: Date }

/** 两个区间是否重叠（端点相接不算重叠：上一单刚好结束时可以开始下一单） */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 生成某一天的候选时段（太平洋时间整点），已排除过近与过远的 */
export function candidateSlots(dateStr: string, now: Date = new Date()): Date[] {
  const earliest = new Date(now.getTime() + MIN_NOTICE_HOURS * 3_600_000);
  const latest = new Date(now.getTime() + MAX_ADVANCE_DAYS * 24 * 3_600_000);
  return SLOT_HOURS
    .map((h) => pacificTime(dateStr, h))
    .filter((t) => t >= earliest && t <= latest);
}
