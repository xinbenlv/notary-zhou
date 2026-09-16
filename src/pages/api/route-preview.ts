import type { APIRoute } from 'astro';
import { previewRoute } from '../../lib/booking/routes.ts';

export const prerender = false;

/**
 * 地址核验 + 路线预览（预约第二步）。
 * 只接受 Places 返回的 placeId，不接受自由文本地址：
 * 客户必须从下拉建议里选一个真实地点，否则「Golden Bridge」这种
 * 输入会被 Routes 猜到某个地方去，静默算出一个完全不相干的价格。
 */
export const POST: APIRoute = async ({ request }) => {
  const json = (u: unknown, status = 200) =>
    new Response(JSON.stringify(u), { status, headers: { 'Content-Type': 'application/json' } });

  let body: { placeId?: unknown };
  try {
    body = (await request.json()) as { placeId?: unknown };
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
  if (!placeId || placeId.length > 500) return json({ error: '缺少有效的 placeId' }, 400);

  const routesKey = process.env.GOOGLE_ROUTES_SERVER_KEY;
  if (!routesKey) return json({ error: '服务端未配置路线服务' }, 500);

  try {
    return json(await previewRoute(routesKey, placeId));
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }
};
