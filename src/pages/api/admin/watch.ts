import type { APIRoute } from 'astro';
import { runWatch } from '../../../lib/booking/watch.ts';
import { CAPTURE_WARN_HOURS } from '../../../lib/booking/lifecycle.ts';

export const prerender = false;

const json = (u: unknown, status = 200) =>
  new Response(JSON.stringify(u, null, 2), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

/**
 * 定时巡检入口。
 *
 * 只认请求头里的令牌、只接受 POST：它会顺带清理过期的 slot_holds（有副作用），
 * 而且令牌要放进 GitHub Actions 的 secret，不该出现在 URL 和访问日志里。
 *
 * 返回体里的 `ok` 是给机器看的：调用方（.github/workflows/booking-watch.yml）
 * 看到 false 就让这一步失败，借 GitHub 的工作流失败通知把人叫醒。
 * 这样不必为了"授权快到期"这一件事引入邮件服务——仓库里本来也没有。
 */
export const POST: APIRoute = async ({ request }) => {
  const expected = process.env.ADMIN_TOKEN;
  const given = request.headers.get('x-admin-token');
  if (!expected || !given || given !== expected) return json({ error: 'unauthorized' }, 401);

  const raw = new URL(request.url).searchParams.get('withinHours');
  const withinHours = raw && /^\d{1,4}$/.test(raw) ? Number(raw) : CAPTURE_WARN_HOURS;

  try {
    const report = await runWatch(withinHours);
    return json({
      ...report,
      note: 'ok=false 表示有需要人立刻处理的事；alerts 是给人看的摘要。',
    });
  } catch (err) {
    // 巡检本身挂了也必须让调用方失败，否则"没有告警"会被误读成"一切正常"
    return json({ ok: false, error: (err as Error).message, alerts: ['巡检执行失败'] }, 500);
  }
};
