import type { APIRoute } from 'astro';
import { getPool } from '../../lib/booking/db';

// 按需执行——需要真实连数据库，不能预渲染
export const prerender = false;

export const GET: APIRoute = async () => {
  const body: Record<string, unknown> = { ok: true, runtime: 'ssr', time: new Date().toISOString() };

  try {
    const db = getPool();
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`
    );
    body.db = { connected: true, tables: rows.map((r) => r.table_name) };
  } catch (err) {
    body.ok = false;
    body.db = { connected: false, error: (err as Error).message };
  }

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
