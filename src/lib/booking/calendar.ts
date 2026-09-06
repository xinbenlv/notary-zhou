// Google Calendar 接入（服务账号）。
//
// 不用 googleapis 包：那是几十 MB 的全量 SDK，而我们只需要三个接口
// （freeBusy 查忙闲、events 建/删）。这里用 node:crypto 自签 JWT 换 access token。
//
// 权限来源不是 IAM，而是「把日历共享给服务账号邮箱」这个动作。
// 已知限制：无域内委派的服务账号**不能给事件添加参会人**（Google 会拒绝），
// 所以客户的日历邀请由我们自己发确认邮件 + .ics 附件完成。

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

export const TIMEZONE = 'America/Los_Angeles';

interface ServiceAccount { client_email: string; private_key: string }

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_CALENDAR_SA_JSON;
  if (!raw) throw new Error('GOOGLE_CALENDAR_SA_JSON 未设置');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error('服务账号 JSON 缺少 client_email 或 private_key');
  return sa;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached: { token: string; expiresAt: number } | null = null;

/** 取 access token，带缓存（提前 60 秒过期，避免边界失败） */
export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const sa = serviceAccount();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`获取 access token 失败: ${json.error_description ?? res.status}`);
  }

  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 };
  return cached.token;
}

async function calendarFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await accessToken();
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? res.status;
    throw new Error(`Calendar API: ${msg}`);
  }
  return json;
}

export interface CalendarRef { id: string; summary: string; accessRole: string; primary?: boolean }

/**
 * 列出共享给服务账号的日历。
 * 有了它就不必让用户手抄日历 ID：共享动作完成后，程序自己发现即可。
 */
export async function listCalendars(): Promise<CalendarRef[]> {
  const json = (await calendarFetch('/users/me/calendarList')) as {
    items?: Array<{ id: string; summary?: string; accessRole?: string; primary?: boolean }>;
  };
  return (json.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary ?? '(无标题)',
    accessRole: c.accessRole ?? 'unknown',
    primary: c.primary,
  }));
}

/** 能写入事件的日历（共享时须授予「更改活动」） */
export async function writableCalendars(): Promise<CalendarRef[]> {
  const all = await listCalendars();
  return all.filter((c) => c.accessRole === 'writer' || c.accessRole === 'owner');
}

export interface BusyPeriod { start: Date; end: Date }

/** 查某个日历在给定区间内的忙碌时段 */
export async function freeBusy(calendarId: string, from: Date, to: Date): Promise<BusyPeriod[]> {
  const json = (await calendarFetch('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: calendarId }],
    }),
  })) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }> };

  const cal = json.calendars?.[calendarId];
  if (cal?.errors?.length) {
    // 最常见的是 notFound —— 日历没共享给服务账号
    throw new Error(`日历不可访问（${cal.errors[0].reason}）：确认已把 ${calendarId} 共享给服务账号并授予「更改活动」`);
  }
  return (cal?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  /** 便于按订单反查/清理 */
  privateProps?: Record<string, string>;
  transparent?: boolean;
}

/** 建事件，返回 event id。注意：不能带 attendees（服务账号限制） */
export async function createEvent(calendarId: string, ev: EventInput): Promise<string> {
  const json = (await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: { dateTime: ev.start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: ev.end.toISOString(), timeZone: TIMEZONE },
      transparency: ev.transparent ? 'transparent' : 'opaque',
      extendedProperties: ev.privateProps ? { private: ev.privateProps } : undefined,
    }),
  })) as { id: string };
  return json.id;
}

/** 删事件。已删除的返回 410，视为成功——取消流程要幂等。 */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('410') || msg.toLowerCase().includes('deleted')) return;
    throw err;
  }
}
