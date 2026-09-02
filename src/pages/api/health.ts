import type { APIRoute } from 'astro';

// 按需执行（非预渲染）——用于确认 SSR 链路正常
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({ ok: true, runtime: 'ssr', time: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } }
  );
