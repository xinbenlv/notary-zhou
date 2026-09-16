import type { APIRoute } from 'astro';
import { parseDocs } from './quote.ts';
import { candidateSlots } from '../../lib/booking/schedule.ts';
import { startCheckout, type Signer } from '../../lib/booking/checkout.ts';

export const prerender = false;

const MAX_SIGNERS = 20;

function parseSigners(raw: unknown): Signer[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SIGNERS).map((s) => {
    const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name.slice(0, 120) : '',
      idType: typeof o.idType === 'string' ? o.idType.slice(0, 80) : '',
    };
  }).filter((s) => s.name);
}

export const POST: APIRoute = async ({ request }) => {
  const json = (u: unknown, status = 200) =>
    new Response(JSON.stringify(u), { status, headers: { 'Content-Type': 'application/json' } });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: '请求体不是合法 JSON', code: 'bad_request' }, 400);
  }

  const date = typeof body.date === 'string' ? body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: '日期格式应为 YYYY-MM-DD', code: 'bad_request' }, 400);

  const parsed = parseDocs(body.documents);
  if ('error' in parsed) return json({ error: parsed.error, code: 'bad_request' }, 400);

  if (body.locationKind !== 'park' && body.locationKind !== 'mobile') {
    return json({ error: "locationKind 必须是 'park' 或 'mobile'", code: 'bad_request' }, 400);
  }
  const locationKind = body.locationKind;
  const placeId = typeof body.placeId === 'string' && body.placeId ? body.placeId : null;
  if (locationKind === 'mobile' && !placeId) {
    return json({ error: '上门服务需要先选定地址', code: 'bad_request' }, 400);
  }

  // 时段不能是客户随便给的时间戳：必须是该日期真实开放的候选时段之一，
  // 否则可以绕开营业时间、最短提前量与最长提前期直接下单。
  const startsAtRaw = typeof body.startsAt === 'string' ? body.startsAt : '';
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return json({ error: 'startsAt 无效', code: 'bad_request' }, 400);
  const allowed = candidateSlots(date).some((t) => t.getTime() === startsAt.getTime());
  if (!allowed) {
    return json({ error: '该时段已不在可预约范围内', code: 'slot_taken' }, 409);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: '在线支付尚未开放', code: 'payments_unavailable' }, 503);
  }
  if (!process.env.BOOKING_CALENDAR_ID || !process.env.GOOGLE_ROUTES_SERVER_KEY) {
    return json({ error: '服务端未配置日历或路线服务', code: 'server_error' }, 500);
  }

  const lang = body.lang === 'en' ? 'en' : 'zh';

  try {
    const result = await startCheckout({
      docs: parsed.docs,
      signers: parseSigners(body.signers),
      startsAt,
      locationKind,
      placeId,
      address: typeof body.address === 'string' ? body.address.slice(0, 300) : null,
      lang,
      origin: new URL(request.url).origin,
    });

    if (!result.ok) return json({ error: result.message, code: result.code }, result.code === 'slot_taken' ? 409 : 422);
    return json({ url: result.url, bookingId: result.bookingId, totalCents: result.totalCents });
  } catch (err) {
    console.error('checkout failed:', (err as Error).message);
    return json({ error: '下单失败，请稍后重试', code: 'server_error' }, 502);
  }
};
