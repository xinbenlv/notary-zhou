import type { APIRoute } from 'astro';
import { completeBooking, cancelBooking, releaseBooking, pendingBookings, planCancel } from '../../../lib/booking/settle.ts';
import { getPool } from '../../../lib/booking/db.ts';
import { expiredAuthorizations } from '../../../lib/booking/watch.ts';
import { captureUrgency } from '../../../lib/booking/lifecycle.ts';

export const prerender = false;

const json = (u: unknown, status = 200) =>
  new Response(JSON.stringify(u, null, 2), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

/**
 * GET 允许用 ?token= 是为了能直接在浏览器里打开看一眼；
 * POST 只认请求头——它会动钱，令牌不该留在浏览器历史和访问日志里。
 */
function authed(request: Request, allowQuery: boolean): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('x-admin-token');
  if (header && header === expected) return true;
  return allowQuery && new URL(request.url).searchParams.get('token') === expected;
}

export const GET: APIRoute = async ({ request }) => {
  if (!authed(request, true)) return json({ error: 'unauthorized' }, 401);
  try {
    const list = await pendingBookings();
    // 每一单顺带算出「此刻取消会扣多少」，省得人工去套政策
    const { rows } = await getPool().query(
      `SELECT id, starts_at, notary_fee_cents, travel_fee_cents, total_cents
         FROM bookings WHERE status IN ('authorized','held')`);
    const plans = new Map(rows.map((r: any) => [r.id, planCancel(r as any)]));
    // 授权已经到期、钱没收到的单子单独列出来：它们不再需要"取消/扣款"这类操作，
    // 需要的是有人知道这笔钱丢了。混在 pending 里会被当成还能处理的单而划过去。
    const expiredUncaptured = await expiredAuthorizations();
    return json({
      pending: list.map((b) => ({
        ...b,
        // ok / warn / critical / expired —— 比单看小时数更容易一眼分出轻重
        urgency: captureUrgency(b.captureBefore ? new Date(b.captureBefore) : null).level,
        cancelNow: plans.get(b.id) ?? null,
      })),
      expiredUncaptured,
      note: 'hoursToCapture 是预授权剩余有效期；到期资金自动释放，这一单就白做了。'
        + ' expiredUncaptured 里的单子已经到期，钱没收到，只能另行向客户收取。',
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!authed(request, false)) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: '请求体不是合法 JSON' }, 400); }

  const id = typeof body.bookingId === 'string' ? body.bookingId : '';
  if (!/^bk_[A-Za-z0-9_-]{1,40}$/.test(id)) return json({ error: 'bookingId 无效' }, 400);

  try {
    if (body.action === 'complete') {
      const raw = body.amountCents;
      const amount = raw === undefined || raw === null ? undefined : Number(raw);
      if (amount !== undefined && !Number.isInteger(amount)) {
        return json({ error: 'amountCents 必须是整数（美分）' }, 400);
      }
      return json(await completeBooking(id, amount));
    }
    if (body.action === 'cancel') {
      const reason = typeof body.reason === 'string' && body.reason ? body.reason : 'admin_cancel';
      return json(await cancelBooking(id, reason));
    }
    if (body.action === 'release') {
      // 逃生口：钱已在 Stripe 那边处理完，这里只把时段和日历放掉
      const reason = typeof body.reason === 'string' && body.reason ? body.reason : 'admin_release';
      return json(await releaseBooking(id, reason));
    }
    return json({ error: "action 必须是 'complete'、'cancel' 或 'release'" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
};
