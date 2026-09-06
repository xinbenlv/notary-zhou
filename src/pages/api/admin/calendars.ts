import type { APIRoute } from 'astro';
import { listCalendars } from '../../../lib/booking/calendar';

export const prerender = false;

// 共享日历给服务账号之后，用这个端点确认是否生效、拿到日历 ID。
// 受 ADMIN_TOKEN 保护：它会暴露日历名称，不该公开。
export const GET: APIRoute = async ({ request }) => {
  const expected = process.env.ADMIN_TOKEN;
  const provided = new URL(request.url).searchParams.get('token');
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const calendars = await listCalendars();
    const writable = calendars.filter((c) => c.accessRole === 'writer' || c.accessRole === 'owner');
    return new Response(JSON.stringify({
      serviceAccount: 'notary-calendar@notaryzhou.iam.gserviceaccount.com',
      calendars,
      writable,
      hint: writable.length
        ? '把 writable 里的 id 设为 BOOKING_CALENDAR_ID'
        : '还没有可写日历：请共享日历给上面的服务账号，权限选「更改活动」',
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
