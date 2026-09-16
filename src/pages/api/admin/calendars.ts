import type { APIRoute } from 'astro';
import { listCalendars, registerCalendar, freeBusy } from '../../../lib/booking/calendar';

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

  // 传入 calendarId 时：实测访问权限并登记，之后即可自动发现。
  // 共享给服务账号只授予 ACL 权限，不会让日历自动进入它的 calendarList。
  const calendarId = new URL(request.url).searchParams.get('calendarId');
  if (calendarId) {
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 24 * 3600 * 1000);
      const busy = await freeBusy(calendarId, from, to);
      await registerCalendar(calendarId);
      return new Response(JSON.stringify({
        calendarId,
        access: 'ok',
        busyNext24h: busy.length,
        next: `把 BOOKING_CALENDAR_ID 设为 ${calendarId}`,
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ calendarId, access: 'failed', error: (err as Error).message }, null, 2),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
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
        : '列表为空是正常的：共享给服务账号不会自动进入它的日历列表。'
          + '请在本 URL 后加 &calendarId=<你的日历ID> 实测权限并登记。',
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
