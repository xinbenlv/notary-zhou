import type { APIRoute } from 'astro';
import { quote, serviceMinutes, type BookingDoc, type FeeRule } from '../../lib/booking/pricing';
import { candidateSlots, pacificDateStr } from '../../lib/booking/schedule';
import { evaluateSlots } from '../../lib/booking/availability';
import { baselineMinutes } from '../../lib/booking/routes';

export const prerender = false;

const FEE_RULES: FeeRule[] = ['standard', 'free', 'imm', 'copy', 'depo'];
const MAX_DOCS = 20;
const MAX_SIGNERS_PER_DOC = 10;
const MAX_COUNT_PER_SIGNER = 10;

interface QuoteRequest {
  date?: unknown;
  locationKind?: unknown;
  placeId?: unknown;
  documents?: unknown;
}

/**
 * 校验客户端传来的文件结构。
 * 价格由服务端算，但**计费规则来自客户端选择的文件类型**，所以必须校验：
 * 否则可以伪造一份 rule='free' 的地契把公证费刷成 0。
 */
function parseDocs(raw: unknown): { docs: BookingDoc[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: '至少需要一份文件' };
  if (raw.length > MAX_DOCS) return { error: `文件数不能超过 ${MAX_DOCS}` };

  const docs: BookingDoc[] = [];
  for (const [i, d] of raw.entries()) {
    if (typeof d !== 'object' || d === null) return { error: `文件 ${i + 1} 格式错误` };
    const doc = d as Record<string, unknown>;

    const rule = doc.rule;
    if (typeof rule !== 'string' || !FEE_RULES.includes(rule as FeeRule)) {
      return { error: `文件 ${i + 1} 的计费类型无效` };
    }
    // 公证类型必须由客户明确选定：公证员依法不能替客户选，"不确定"不可下单
    const act = doc.act;
    const needsAct = rule !== 'copy' && rule !== 'depo';
    if (needsAct && act !== 'ack' && act !== 'jurat') {
      return { error: `文件 ${i + 1} 必须选择「签名确认」或「宣誓」` };
    }

    const partsRaw = Array.isArray(doc.parts) ? doc.parts : [];
    if (partsRaw.length > MAX_SIGNERS_PER_DOC) return { error: `文件 ${i + 1} 签署人过多` };
    const parts = partsRaw.map((p) => {
      const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      const count = Number(o.count);
      return {
        name: typeof o.name === 'string' ? o.name.slice(0, 120) : '',
        count: Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 1), MAX_COUNT_PER_SIGNER) : 1,
      };
    });
    if (needsAct && parts.length === 0) return { error: `文件 ${i + 1} 需要至少一位签署人` };

    docs.push({
      typeKey: typeof doc.typeKey === 'string' ? doc.typeKey.slice(0, 60) : 'other',
      rule: rule as FeeRule,
      act: act as BookingDoc['act'],
      parts,
    });
  }
  return { docs };
}

export const POST: APIRoute = async ({ request }) => {
  const json = (u: unknown, status = 200) =>
    new Response(JSON.stringify(u), { status, headers: { 'Content-Type': 'application/json' } });

  let body: QuoteRequest;
  try {
    body = (await request.json()) as QuoteRequest;
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const date = typeof body.date === 'string' ? body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: '日期格式应为 YYYY-MM-DD' }, 400);

  // 先验文件：它承载计费规则，错误信息也最需要具体反馈
  const parsed = parseDocs(body.documents);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const { docs } = parsed;

  // 地点类型必须显式给出，不猜默认值——猜错会算出完全不同的价格
  if (body.locationKind !== 'park' && body.locationKind !== 'mobile') {
    return json({ error: "locationKind 必须是 'park' 或 'mobile'" }, 400);
  }
  const locationKind = body.locationKind;
  const placeId = typeof body.placeId === 'string' && body.placeId ? body.placeId : null;
  if (locationKind === 'mobile' && !placeId) {
    return json({ error: '上门服务需要先选定地址' }, 400);
  }

  const calendarId = process.env.BOOKING_CALENDAR_ID;
  const routesKey = process.env.GOOGLE_ROUTES_SERVER_KEY;
  if (!calendarId || !routesKey) return json({ error: '服务端未配置日历或路线服务' }, 500);

  const svcMinutes = serviceMinutes(docs);
  const slots = candidateSlots(date);
  if (!slots.length) {
    return json({ date, serviceMinutes: svcMinutes, slots: [], note: '该日期没有可预约时段' });
  }

  try {
    // 自取无需车程；上门先取畅通基准，用于反推各时段的出发时刻
    const baseline = placeId ? await baselineMinutes(routesKey, placeId) : 0;

    const evaluated = await evaluateSlots({
      slots, serviceMinutes: svcMinutes, calendarId,
      placeId: locationKind === 'mobile' ? placeId : null,
      routesApiKey: routesKey, baselineMinutes: baseline,
    });

    const out = evaluated.map((s) => {
      const q = quote(docs, s.outboundMinutes ?? 0, s.returnMinutes ?? 0);
      return {
        startsAt: s.startsAt.toISOString(),
        available: s.available,
        reason: s.reason,
        // 只有可约时段才给价格，避免前端展示无意义的数字
        ...(s.available ? {
          notaryFeeCents: q.notaryFeeCents,
          travelFeeCents: q.travelFeeCents,
          totalCents: q.totalCents,
          outboundMinutes: s.outboundMinutes,
          returnMinutes: s.returnMinutes,
        } : {}),
      };
    });

    const base = quote(docs, 0, 0);
    return json({
      date: pacificDateStr(slots[0]),
      serviceMinutes: svcMinutes,
      notaryFeeCents: base.notaryFeeCents,
      actsTotal: base.actsTotal,
      actsWaived: base.actsWaived,
      slots: out,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }
};
