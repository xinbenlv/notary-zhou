// 结算：把预授权变成实际扣款，或者放掉。
//
// 预授权模式下「退款」这个概念基本消失了——钱从没扣过，所以退款政策
// 变成了「扣多少」。这带来两个真实的好处：48 小时前取消是零手续费，
// 而且公证完成时若实际签名处比预约时少，直接少扣即可，不必先收再退。

import { getPool } from './db.ts';
import { capturePaymentIntent, cancelPaymentIntent } from './stripe.ts';
import { deleteEvent } from './calendar.ts';
import { refundTier, refundCents, type RefundTier } from './pricing.ts';

/** Stripe 的最低收款额。低于这个数扣不了，只能整笔放掉。 */
export const STRIPE_MIN_CENTS = 50;

export interface BookingRow {
  id: string;
  status: string;
  starts_at: Date;
  notary_fee_cents: number;
  travel_fee_cents: number;
  total_cents: number;
  payment_intent_id: string | null;
  event_id_service: string | null;
  event_id_outbound: string | null;
  event_id_return: string | null;
}

const COLS = `id, status, starts_at, notary_fee_cents, travel_fee_cents, total_cents,
              payment_intent_id, event_id_service, event_id_outbound, event_id_return`;

async function load(id: string): Promise<BookingRow> {
  const { rows } = await getPool().query<BookingRow>(`SELECT ${COLS} FROM bookings WHERE id = $1`, [id]);
  if (!rows.length) throw new Error(`订单不存在: ${id}`);
  return rows[0];
}

export interface CancelPlan {
  tier: RefundTier;
  /** 按政策应当扣下的金额 */
  captureCents: number;
  /** 客户实际少付的部分（相对已授权金额） */
  releasedCents: number;
}

/**
 * 取消时该扣多少。
 * 三档政策原本写的是「退多少」，这里换算成「扣多少」：扣 = 授权额 − 应退额。
 * 低于 Stripe 最低收款额时按 0 处理——扣不了的零头不该变成"技术上失败"，
 * 更不该为此去收一笔客户没同意的更大金额。
 */
export function planCancel(b: BookingRow, now: Date = new Date()): CancelPlan {
  const tier = refundTier(new Date(b.starts_at), now);
  const refund = refundCents(
    { notaryFeeCents: b.notary_fee_cents, travelFeeCents: b.travel_fee_cents }, tier);
  let capture = Math.max(0, b.total_cents - refund);
  if (capture < STRIPE_MIN_CENTS) capture = 0;
  return { tier, captureCents: capture, releasedCents: b.total_cents - capture };
}

async function dropEvents(b: BookingRow): Promise<void> {
  const calendarId = process.env.BOOKING_CALENDAR_ID;
  if (!calendarId) return;
  for (const id of [b.event_id_service, b.event_id_outbound, b.event_id_return]) {
    if (id) await deleteEvent(calendarId, id);       // 已删的返回 410，视为成功
  }
}

export interface SettleResult {
  bookingId: string;
  status: string;
  capturedCents: number;
  releasedCents: number;
  tier?: RefundTier;
}

/**
 * 公证完成，扣款。
 * amountCents 可低于授权额（当天实际公证的签名处比预约时少），余额自动释放；
 * **一笔授权只能扣一次**，所以签名处变多必须另开一笔，不能指望在这里补扣。
 */
export async function completeBooking(id: string, amountCents?: number): Promise<SettleResult> {
  const b = await load(id);
  if (b.status === 'completed') {
    return { bookingId: id, status: 'completed', capturedCents: 0, releasedCents: 0 };
  }
  if (b.status !== 'authorized') throw new Error(`订单状态为 ${b.status}，不能扣款`);
  if (!b.payment_intent_id) throw new Error('订单没有 payment_intent');

  const amount = amountCents ?? b.total_cents;
  if (amount > b.total_cents) {
    throw new Error(`扣款额不能超过授权额 $${(b.total_cents / 100).toFixed(2)}；需要多收请另开一笔`);
  }
  if (amount < STRIPE_MIN_CENTS) throw new Error(`扣款额低于 Stripe 最低收款额 $${STRIPE_MIN_CENTS / 100}`);

  await capturePaymentIntent(b.payment_intent_id, amount);
  await getPool().query(
    `UPDATE bookings SET status='completed', captured_cents=$1, captured_at=now(), updated_at=now()
      WHERE id=$2`, [amount, id]);

  return { bookingId: id, status: 'completed', capturedCents: amount, releasedCents: b.total_cents - amount };
}

/**
 * 取消预约，按三档政策结算。
 *
 * 注意状态写入的顺序：先调 Stripe，再写库。部分扣款会让 Stripe 发出
 * payment_intent.succeeded，webhook 收到后只会把 authorized 推进到 completed；
 * 这里随后写入的 'cancelled' 覆盖它，cancel_reason 也留下了区分依据。
 */
export async function cancelBooking(id: string, reason: string, now: Date = new Date()): Promise<SettleResult> {
  const b = await load(id);
  if (b.status === 'cancelled') {
    return { bookingId: id, status: 'cancelled', capturedCents: 0, releasedCents: 0 };
  }
  if (b.status === 'completed') throw new Error('订单已扣款完成，取消需要走退款而不是撤销授权');
  if (b.status !== 'authorized' && b.status !== 'held') throw new Error(`订单状态为 ${b.status}，无法取消`);

  const plan = planCancel(b, now);

  if (b.payment_intent_id) {
    if (plan.captureCents > 0) await capturePaymentIntent(b.payment_intent_id, plan.captureCents);
    else await cancelPaymentIntent(b.payment_intent_id, 'requested_by_customer');
  }
  await dropEvents(b);

  await getPool().query(
    `UPDATE bookings SET status='cancelled', cancelled_at=now(), cancel_reason=$1,
            captured_cents=$2, captured_at=CASE WHEN $2 > 0 THEN now() ELSE NULL END,
            event_id_service=NULL, event_id_outbound=NULL, event_id_return=NULL, updated_at=now()
      WHERE id=$3`,
    [reason.slice(0, 200), plan.captureCents, id]);
  await getPool().query('DELETE FROM slot_holds WHERE booking_id = $1', [id]);

  return { bookingId: id, status: 'cancelled', capturedCents: plan.captureCents,
           releasedCents: plan.releasedCents, tier: plan.tier };
}

export interface PendingBooking {
  id: string; status: string; startsAt: string; captureBefore: string | null;
  hoursToCapture: number | null; totalCents: number; email: string | null; phone: string | null;
  locationKind: string; address: string | null; serviceMinutes: number;
}

/**
 * 待处理的单子。按授权到期时刻排序，最紧迫的在最前面——
 * 授权过期资金自动释放，这一单就白做了，所以这是运营上最需要盯的信息。
 */
export async function pendingBookings(limit = 50): Promise<PendingBooking[]> {
  const { rows } = await getPool().query(
    `SELECT id, status, starts_at, capture_before, total_cents, email, phone,
            location_kind, address, service_minutes
       FROM bookings
      WHERE status IN ('authorized','held')
      ORDER BY capture_before NULLS LAST, starts_at
      LIMIT $1`, [limit]);
  const now = Date.now();
  return rows.map((r: any) => ({
    id: r.id, status: r.status,
    startsAt: new Date(r.starts_at).toISOString(),
    captureBefore: r.capture_before ? new Date(r.capture_before).toISOString() : null,
    hoursToCapture: r.capture_before
      ? Math.round((new Date(r.capture_before).getTime() - now) / 3_600_00) / 10 : null,
    totalCents: r.total_cents, email: r.email, phone: r.phone,
    locationKind: r.location_kind, address: r.address, serviceMinutes: r.service_minutes,
  }));
}
