import type { APIRoute } from 'astro';
import { verifyWebhook, getPaymentIntent } from '../../../lib/booking/stripe.ts';
import { getPool } from '../../../lib/booking/db.ts';
import { createEvent, deleteEvent } from '../../../lib/booking/calendar.ts';
import { ARRIVE_EARLY_MIN } from '../../../lib/booking/pricing.ts';

export const prerender = false;

/**
 * Stripe webhook。这是订单真正落地的地方——成功页只是给客户看的，
 * 客户可能付完就关掉标签页，所以不能把落单逻辑放在那里。
 *
 * 三条硬约束：
 * 1. 必须用**原始请求体**验签，JSON.parse 再 stringify 会改变字节序列。
 * 2. 必须幂等：Stripe 会重试推送，同一 event 处理两次就会写出两份日历事件。
 * 3. 已知事件处理失败要返回非 2xx，让 Stripe 重试；未知事件直接 200，
 *    否则 Stripe 会因为我们不关心的事件不断重试并最终停用端点。
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook secret 未配置', { status: 500 });

  const raw = await request.text();
  let event;
  try {
    event = verifyWebhook(raw, request.headers.get('stripe-signature'), secret);
  } catch (err) {
    // 验签失败一律 400，且不回显细节
    console.warn('stripe webhook rejected:', (err as Error).message);
    return new Response('signature verification failed', { status: 400 });
  }

  const db = getPool();
  // 先占坑再处理：ON CONFLICT DO NOTHING 返回 0 行就说明这条已经处理过
  const { rowCount } = await db.query(
    'INSERT INTO processed_events (event_id, type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING',
    [event.id, event.type],
  );
  if (rowCount === 0) return new Response('already processed', { status: 200 });

  try {
    if (event.type === 'checkout.session.completed') {
      await onCompleted(event.data.object as Record<string, any>);
    } else if (event.type === 'checkout.session.expired') {
      await onExpired(event.data.object as Record<string, any>);
    } else if (event.type === 'payment_intent.canceled') {
      await onCanceled(event.data.object as Record<string, any>);
    } else if (event.type === 'payment_intent.succeeded') {
      await onCaptured(event.data.object as Record<string, any>);
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    // 处理失败就把幂等记录撤掉，否则 Stripe 重试会被当成"已处理"而静默跳过
    await db.query('DELETE FROM processed_events WHERE event_id = $1', [event.id]).catch(() => {});
    console.error(`stripe webhook ${event.type} failed:`, (err as Error).message);
    return new Response('handler failed', { status: 500 });
  }
};

async function onCompleted(session: Record<string, any>): Promise<void> {
  const db = getPool();
  const bookingId: string | undefined = session.client_reference_id ?? session.metadata?.bookingId;
  if (!bookingId) throw new Error('会话缺少 bookingId');

  const { rows } = await db.query(
    `SELECT id, status, starts_at, service_minutes, blocked_from, blocked_to,
            location_kind, address, outbound_minutes, return_minutes,
            total_cents, documents, signers
       FROM bookings WHERE id = $1`, [bookingId]);
  if (!rows.length) throw new Error(`订单不存在: ${bookingId}`);
  const b = rows[0];
  if (b.status !== 'held') return;     // 已经处理过（或已取消），不重复写日历

  // 以 PaymentIntent 为准，不看 session.payment_status：手动扣款模式下
  // 完成结账只是"资金被冻结"，requires_capture 才是我们要的状态。
  const piId: string | null = session.payment_intent ?? null;
  if (!piId) throw new Error('会话没有 payment_intent');
  const pi = await getPaymentIntent(piId);
  const captureBefore = (pi as any).latest_charge?.payment_method_details?.card?.capture_before;

  const startsAt = new Date(b.starts_at);
  const endsAt = new Date(startsAt.getTime() + b.service_minutes * 60_000);
  const where = b.location_kind === 'park' ? 'Sunnyvale Lakewood Park' : (b.address ?? '');
  const who = (b.signers as Array<{ name: string; idType: string }>)
    .map((s) => `${s.name}（${s.idType}）`).join('、');
  const what = (b.documents as Array<{ typeKey: string; act?: string; parts: Array<{ count: number }> }>)
    .map((d) => `${d.typeKey}${d.act ? `/${d.act}` : ''}×${d.parts.reduce((n, p) => n + p.count, 0)}`).join('、');

  const calendarId = process.env.BOOKING_CALENDAR_ID!;
  const props = { bookingId };
  const serviceEvent = await createEvent(calendarId, {
    summary: `公证 ${who || bookingId}`,
    description: [`订单 ${bookingId}`, `文件：${what}`, `签署人：${who}`,
      `金额：$${(b.total_cents / 100).toFixed(2)}（已预授权，完成后扣款）`,
      captureBefore ? `授权有效至：${new Date(captureBefore * 1000).toISOString()}` : ''].filter(Boolean).join('\n'),
    location: where, start: startsAt, end: endsAt, privateProps: props,
  });

  // 去程与回程单独建事件：它们才是真正让这一单占掉近三小时的部分，
  // 只写服务本身会让日历看起来还有空，从而接到排不开的单。
  let outboundEvent: string | null = null;
  let returnEvent: string | null = null;
  if (b.location_kind === 'mobile') {
    outboundEvent = await createEvent(calendarId, {
      summary: `去程 → ${where}`, location: where,
      start: new Date(b.blocked_from), end: new Date(startsAt.getTime() - ARRIVE_EARLY_MIN * 60_000),
      description: `订单 ${bookingId}`, privateProps: props,
    });
    returnEvent = await createEvent(calendarId, {
      summary: '回程 → Lakewood Park', location: 'Lakewood Park, Sunnyvale, CA',
      start: new Date(new Date(b.blocked_to).getTime() - (b.return_minutes ?? 0) * 60_000),
      end: new Date(b.blocked_to),
      description: `订单 ${bookingId}`, privateProps: props,
    });
  }

  await db.query(
    `UPDATE bookings SET status='authorized', payment_intent_id=$1, email=$2, phone=$3,
            capture_before=$4, event_id_service=$5, event_id_outbound=$6, event_id_return=$7,
            updated_at=now()
      WHERE id=$8`,
    [piId, session.customer_details?.email ?? null, session.customer_details?.phone ?? null,
     captureBefore ? new Date(captureBefore * 1000) : null,
     serviceEvent, outboundEvent, returnEvent, bookingId],
  );
  // 位子已由订单本身占住，临时保留可以撤掉
  await db.query('DELETE FROM slot_holds WHERE booking_id = $1', [bookingId]);
}

async function onExpired(session: Record<string, any>): Promise<void> {
  const db = getPool();
  const bookingId: string | undefined = session.client_reference_id ?? session.metadata?.bookingId;
  if (!bookingId) return;
  await db.query("UPDATE bookings SET status='expired', updated_at=now() WHERE id=$1 AND status='held'", [bookingId]);
  await db.query('DELETE FROM slot_holds WHERE booking_id = $1', [bookingId]);
}

/**
 * 撤销预授权（在 Stripe 后台点 Cancel，或授权到期自动释放）。
 * 订单和日历必须跟着释放，否则钱已经退回客户、时段却还占着。
 * 授权到期同样走这个事件，所以过期的单子不会永远挂在日历上。
 */
async function onCanceled(pi: Record<string, any>): Promise<void> {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT id, status, event_id_service, event_id_outbound, event_id_return
       FROM bookings WHERE payment_intent_id = $1`, [pi.id]);
  if (!rows.length) return;
  const b = rows[0];
  if (b.status === 'completed') return;          // 已扣款的不该出现在这里，别误删

  const calendarId = process.env.BOOKING_CALENDAR_ID!;
  for (const id of [b.event_id_service, b.event_id_outbound, b.event_id_return]) {
    if (id) await deleteEvent(calendarId, id);   // 已删的返回 410，deleteEvent 视为成功
  }
  await db.query(
    `UPDATE bookings SET status='cancelled', cancelled_at=now(), cancel_reason=$1,
            event_id_service=NULL, event_id_outbound=NULL, event_id_return=NULL, updated_at=now()
      WHERE id=$2`,
    [pi.cancellation_reason ?? 'stripe_canceled', b.id]);
  await db.query('DELETE FROM slot_holds WHERE booking_id = $1', [b.id]);
}

/**
 * 扣款成功。既可能来自我们的管理端，也可能是有人直接在 Stripe 后台点了 Capture ——
 * 后者不经过我们的代码，所以必须在这里把账记上，否则库里永远停在 authorized。
 *
 * 只允许 authorized → completed。取消时的部分扣款同样会触发本事件，
 * 但那一路随后会把状态写成 cancelled；这里不碰 cancelled/completed，
 * 免得一条迟到的事件把已取消的单子翻回"已完成"。
 */
async function onCaptured(pi: Record<string, any>): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE bookings
        SET status='completed', captured_cents=$1, captured_at=now(), updated_at=now()
      WHERE payment_intent_id=$2 AND status='authorized'`,
    [pi.amount_received ?? pi.amount, pi.id]);
}
