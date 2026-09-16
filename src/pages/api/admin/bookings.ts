import type { APIRoute } from 'astro';
import { completeBooking, cancelBooking, releaseBooking, pendingBookings, planCancel } from '../../../lib/booking/settle.ts';
import { getPool } from '../../../lib/booking/db.ts';
import { expiredAuthorizations } from '../../../lib/booking/watch.ts';
import { captureUrgency } from '../../../lib/booking/lifecycle.ts';
import { docActs, docFeeCents, type BookingDoc } from '../../../lib/booking/pricing.ts';
import { docType } from '../../../lib/booking/doctypes.ts';

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

const ACT_LABEL: Record<string, string> = { ack: '签名确认', jurat: '宣誓', unsure: '未定' };

/**
 * 到场需要的那几样：文件名、公证类型、每人几处签名。
 * 在服务端把 typeKey 翻成中文名，是为了让页面只管排版——
 * 文件目录是计费规则的唯一来源，不该在前端再复制一份。
 */
function describeDocs(raw: unknown): Array<{
  label: string; act: string | null; acts: number; feeCents: number;
  parts: Array<{ name: string; count: number }>;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => {
    const doc = d as BookingDoc;
    const parts = Array.isArray(doc.parts) ? doc.parts : [];
    return {
      label: docType(doc.typeKey)?.zh ?? doc.typeKey ?? '未知文件',
      act: doc.act ? ACT_LABEL[doc.act] ?? doc.act : null,
      acts: docActs({ ...doc, parts }),
      feeCents: docFeeCents({ ...doc, parts }),
      parts: parts.map((p) => ({ name: p.name || '未填写', count: p.count })),
    };
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!authed(request, true)) return json({ error: 'unauthorized' }, 401);
  try {
    const list = await pendingBookings();
    // 每一单顺带算出「此刻取消会扣多少」，省得人工去套政策；
    // 同时把到场要用的信息（签署人、文件、费用拆分）一并带出，
    // 让页面一次请求就够——路边不该为了看一眼签署人再发一次请求。
    const { rows } = await getPool().query(
      `SELECT id, starts_at, notary_fee_cents, travel_fee_cents, total_cents,
              documents, signers, pricing_snapshot
         FROM bookings WHERE status IN ('authorized','held')`);
    const extra = new Map(rows.map((r: any) => {
      const snap = (r.pricing_snapshot ?? {}) as Record<string, number>;
      const actsTotal = Number(snap.actsTotal ?? 0);
      const actsWaived = Number(snap.actsWaived ?? 0);
      return [r.id, {
        plan: planCancel(r as any),
        notaryFeeCents: r.notary_fee_cents,
        travelFeeCents: r.travel_fee_cents,
        // 可下调的基准：收费的签名处数。免费类文件不计入——少做一份也不减钱。
        actsBillable: Math.max(0, actsTotal - actsWaived),
        notaryFeePerActCents: Number(snap.notaryFeePerAct ?? 0) || null,
        signers: Array.isArray(r.signers) ? r.signers : [],
        documents: describeDocs(r.documents),
      }];
    }));
    // 授权已经到期、钱没收到的单子单独列出来：它们不再需要"取消/扣款"这类操作，
    // 需要的是有人知道这笔钱丢了。混在 pending 里会被当成还能处理的单而划过去。
    const expiredUncaptured = await expiredAuthorizations();
    return json({
      pending: list.map((b) => {
        const e = extra.get(b.id);
        return {
          ...b,
          // ok / warn / critical / expired —— 比单看小时数更容易一眼分出轻重
          urgency: captureUrgency(b.captureBefore ? new Date(b.captureBefore) : null).level,
          cancelNow: e?.plan ?? null,
          ...(e ? {
            notaryFeeCents: e.notaryFeeCents, travelFeeCents: e.travelFeeCents,
            actsBillable: e.actsBillable, notaryFeePerActCents: e.notaryFeePerActCents,
            signers: e.signers, documents: e.documents,
          } : {}),
        };
      }),
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
