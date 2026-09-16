// 下单：把「重新验价 → 占位 → 建结账会话」串起来。
//
// 全程不采信前端传来的任何金额。前端传的是**选择**（文件、地点、时段），
// 价格在这里按同一套服务端逻辑重算一遍；客户在 Stripe 上看到的数字，
// 来自这次重算，而不是上一次 /api/quote 的结果——两次之间路况会变。

import { randomBytes } from 'node:crypto';
import { getPool } from './db.ts';
import { quote, serviceMinutes, blockWindow, type BookingDoc,
  NOTARY_FEE_CENTS, TRAVEL_BASE_CENTS, TRAVEL_PER_MIN_CENTS } from './pricing.ts';
import { evaluateSlots } from './availability.ts';
import { baselineMinutes } from './routes.ts';
import { createCheckoutSession } from './stripe.ts';

/** Stripe 要求结账会话至少 30 分钟后过期，所以时段保留也用 30 分钟 */
export const HOLD_MINUTES = 30;
/** 保留比会话多留 5 分钟：任何时刻都不能出现「会话还能付、位子已释放」的窗口 */
const HOLD_SLACK_MINUTES = 5;

export const newBookingId = () => `bk_${randomBytes(9).toString('base64url')}`;

export interface Signer { name: string; idType: string }

export interface CheckoutInput {
  docs: BookingDoc[];
  signers: Signer[];
  startsAt: Date;
  locationKind: 'park' | 'mobile';
  placeId: string | null;
  address: string | null;
  lang: 'zh' | 'en';
  origin: string;
}

export type CheckoutResult =
  | { ok: true; url: string; bookingId: string; totalCents: number }
  | { ok: false; code: 'slot_taken' | 'routes_failed' | 'zero_total'; message: string };

const L = (lang: 'zh' | 'en', zh: string, en: string) => (lang === 'zh' ? zh : en);

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const { docs, startsAt, locationKind, placeId, lang } = input;
  const calendarId = process.env.BOOKING_CALENDAR_ID!;
  const routesKey = process.env.GOOGLE_ROUTES_SERVER_KEY!;

  const svcMinutes = serviceMinutes(docs);

  // 只评估被选中的那一个时段——价格与可用性都以此刻为准
  const baseline = placeId ? await baselineMinutes(routesKey, placeId) : 0;
  const [slot] = await evaluateSlots({
    slots: [startsAt], serviceMinutes: svcMinutes, calendarId,
    placeId: locationKind === 'mobile' ? placeId : null,
    routesApiKey: routesKey, baselineMinutes: baseline,
  });

  if (!slot.available) {
    return slot.reason === 'routes_failed'
      ? { ok: false, code: 'routes_failed', message: L(lang, '暂时算不出车程，请稍后重试。', 'Could not compute the drive time. Please try again.') }
      : { ok: false, code: 'slot_taken', message: L(lang, '该时段刚被占用，请重新选择。', 'That slot was just taken. Please pick another.') };
  }

  const outbound = slot.outboundMinutes ?? 0;
  const inbound = slot.returnMinutes ?? 0;
  const q = quote(docs, outbound, inbound);
  const win = blockWindow(startsAt, svcMinutes, outbound, inbound);

  // 依法免费的文件 + 自取 = 合计 $0。Stripe 有最低收款额（约 $0.50），
  // 这种单没法走结账；金额本来就是零，转人工确认即可，不必为此建表单收邮箱。
  if (q.totalCents === 0) {
    return { ok: false, code: 'zero_total', message: L(lang,
      '这一单依法免收费用，合计 $0，无需在线支付——请来信与我们确认时段。',
      'This one is free by law and totals $0, so there is nothing to pay online — please email us to confirm the slot.') };
  }

  const bookingId = newBookingId();
  const now = Date.now();
  const sessionExpires = new Date(now + HOLD_MINUTES * 60_000);
  const holdExpires = new Date(now + (HOLD_MINUTES + HOLD_SLACK_MINUTES) * 60_000);

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // 整个「查冲突 → 占位」必须串行，否则两个客户会同时通过检查。
    // 单公证员的量级下，一把全局咨询锁比排他约束简单得多，也够用。
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['notary_booking_slot']);

    const { rows: clash } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM (
         SELECT 1 FROM bookings
          WHERE status IN ('held','authorized','paid','completed')
            AND blocked_to > $1 AND blocked_from < $2
         UNION ALL
         SELECT 1 FROM slot_holds
          WHERE expires_at > now() AND blocked_to > $1 AND blocked_from < $2
       ) x`,
      [win.from, win.to],
    );
    if (Number(clash[0].n) > 0) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'slot_taken', message: L(lang, '该时段刚被占用，请重新选择。', 'That slot was just taken. Please pick another.') };
    }

    await client.query(
      `INSERT INTO bookings (
         id, status, starts_at, service_minutes, blocked_from, blocked_to,
         location_kind, address, place_id, outbound_minutes, return_minutes,
         notary_fee_cents, travel_fee_cents, total_cents, pricing_snapshot,
         documents, signers
       ) VALUES ($1,'held',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        bookingId, startsAt, svcMinutes, win.from, win.to,
        locationKind, input.address, placeId, outbound, inbound,
        q.notaryFeeCents, q.travelFeeCents, q.totalCents,
        JSON.stringify({
          notaryFeePerAct: NOTARY_FEE_CENTS,
          travelBase: TRAVEL_BASE_CENTS, travelPerMin: TRAVEL_PER_MIN_CENTS,
          outboundMinutes: outbound, returnMinutes: inbound,
          actsTotal: q.actsTotal, actsWaived: q.actsWaived, quotedAt: new Date().toISOString(),
        }),
        JSON.stringify(docs), JSON.stringify(input.signers),
      ],
    );
    await client.query(
      `INSERT INTO slot_holds (id, booking_id, blocked_from, blocked_to, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [`hd_${randomBytes(9).toString('base64url')}`, bookingId, win.from, win.to, holdExpires],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 建会话放在事务之后：外部调用不该占着数据库锁
  const lines = [
    { name: L(lang, '公证费', 'Notarial fee'),
      description: L(lang, `${q.actsTotal - q.actsWaived} 个签名处 × $15（法定上限）`,
                           `${q.actsTotal - q.actsWaived} signature(s) × $15 (statutory cap)`),
      amountCents: q.notaryFeeCents },
  ];
  if (q.travelFeeCents > 0) {
    lines.push({
      name: L(lang, '交通费', 'Travel fee'),
      description: L(lang, `往返车程约 ${outbound + inbound} 分钟`, `about ${outbound + inbound} min round trip`),
      amountCents: q.travelFeeCents,
    });
  }

  let session;
  try {
    session = await createCheckoutSession({
      bookingId,
      lines,
      successUrl: `${input.origin}${lang === 'en' ? '/en' : ''}/booked/?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${input.origin}${lang === 'en' ? '/en' : ''}/book/`,
      expiresAt: sessionExpires,
      metadata: { bookingId, startsAt: startsAt.toISOString() },
      locale: lang,
    });
  } catch (err) {
    // 建会话失败就立刻放掉占位，否则这个时段要白锁到保留期满
    await db.query('DELETE FROM slot_holds WHERE booking_id = $1', [bookingId]).catch(() => {});
    await db.query("UPDATE bookings SET status='expired', updated_at=now() WHERE id=$1", [bookingId]).catch(() => {});
    throw err;
  }

  await db.query('UPDATE bookings SET checkout_session_id = $1, updated_at = now() WHERE id = $2',
    [session.id, bookingId]);

  return { ok: true, url: session.url, bookingId, totalCents: q.totalCents };
}
