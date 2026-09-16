// 时段可用性：把日历忙闲、已有订单、车程窗口合起来算出哪些时段真能约。
//
// 判定依据是**完整占用窗口**（出发 → 服务 → 返回），不是预约时刻本身：
// 一个 SFO 的单子实际占掉近三小时，若只比对预约时刻就会重复接单。

import { getPool } from './db.ts';
import { freeBusy } from './calendar.ts';
import { overlaps, type Interval } from './schedule.ts';
import { blockWindow } from './pricing.ts';
import { roundTrip, type Leg } from './routes.ts';

export interface SlotEval {
  startsAt: Date;
  available: boolean;
  reason?: 'calendar' | 'booked' | 'routes_failed';
  outboundMinutes?: number;
  returnMinutes?: number;
  window?: Interval;
}

/** 数据库中已占用的窗口（含未过期的临时保留） */
export async function bookedWindows(from: Date, to: Date): Promise<Interval[]> {
  const db = getPool();
  const { rows } = await db.query<{ blocked_from: Date; blocked_to: Date }>(
    `SELECT blocked_from, blocked_to FROM bookings
      WHERE status IN ('held','authorized','paid','completed')
        AND blocked_to > $1 AND blocked_from < $2
     UNION ALL
     SELECT blocked_from, blocked_to FROM slot_holds
      WHERE expires_at > now() AND blocked_to > $1 AND blocked_from < $2`,
    [from, to],
  );
  return rows.map((r) => ({ start: new Date(r.blocked_from), end: new Date(r.blocked_to) }));
}

/** 车程结果缓存：同一地址同一时段的预测短时间内不会变，避免用户切日期时重复烧配额 */
const legCache = new Map<string, { legs: { outbound: Leg; inbound: Leg }; at: number }>();
const LEG_TTL_MS = 15 * 60_000;

async function cachedRoundTrip(
  apiKey: string, placeId: string, startsAt: Date, serviceMinutes: number, baseline: number,
) {
  const key = `${placeId}|${startsAt.toISOString()}|${serviceMinutes}`;
  const hit = legCache.get(key);
  if (hit && Date.now() - hit.at < LEG_TTL_MS) return hit.legs;

  const legs = await roundTrip(apiKey, placeId, startsAt, serviceMinutes, baseline);
  legCache.set(key, { legs, at: Date.now() });
  if (legCache.size > 500) {
    for (const [k, v] of legCache) if (Date.now() - v.at > LEG_TTL_MS) legCache.delete(k);
  }
  return legs;
}

export interface EvaluateArgs {
  slots: Date[];
  serviceMinutes: number;
  calendarId: string;
  /** 自取时为 null —— 无车程，窗口就是服务时长本身 */
  placeId: string | null;
  routesApiKey: string;
  baselineMinutes: number;
}

/**
 * 逐个时段判定可用性。
 * 日历忙闲一次性查完整天（一次 API 调用），车程按时段分别查（有缓存）。
 */
export async function evaluateSlots(args: EvaluateArgs): Promise<SlotEval[]> {
  const { slots, serviceMinutes, calendarId, placeId, routesApiKey, baselineMinutes } = args;
  if (!slots.length) return [];

  // 查询范围要放宽：最早时段可能提前出发，最晚时段可能延后返回
  const pad = 4 * 3_600_000;
  const from = new Date(slots[0].getTime() - pad);
  const to = new Date(slots[slots.length - 1].getTime() + serviceMinutes * 60_000 + pad);

  const [busy, booked] = await Promise.all([freeBusy(calendarId, from, to), bookedWindows(from, to)]);
  // 标记来源，便于向前端说明「日历上有事」还是「已被别人约走」
  const blocked: Array<Interval & { source: 'calendar' | 'booked' }> = [
    ...busy.map((b) => ({ ...b, source: 'calendar' as const })),
    ...booked.map((b) => ({ ...b, source: 'booked' as const })),
  ];

  return Promise.all(slots.map(async (startsAt): Promise<SlotEval> => {
    let outbound = 0, inbound = 0;
    if (placeId) {
      try {
        const legs = await cachedRoundTrip(routesApiKey, placeId, startsAt, serviceMinutes, baselineMinutes);
        outbound = legs.outbound.minutes;
        inbound = legs.inbound.minutes;
      } catch {
        // 单个时段查不出车程不应让整页失败；标记不可约即可
        return { startsAt, available: false, reason: 'routes_failed' };
      }
    }

    const w = blockWindow(startsAt, serviceMinutes, outbound, inbound);
    const window: Interval = { start: w.from, end: w.to };
    const clash = blocked.find((b) => overlaps(window, b));

    return {
      startsAt,
      available: !clash,
      reason: clash?.source,
      outboundMinutes: outbound,
      returnMinutes: inbound,
      window,
    };
  }));
}
