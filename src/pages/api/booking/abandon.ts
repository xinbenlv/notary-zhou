import type { APIRoute } from 'astro';
import { releasePendingHold } from '../../../lib/booking/checkout.ts';

export const prerender = false;

/**
 * Stripe 结账页的「返回」落点。
 *
 * 原先 cancel_url 直接指回 /book/，于是客户一按返回，自己刚放弃的那个时段
 * 还要再锁 35 分钟（结账会话 30 分钟 + 5 分钟余量）。他立刻重订，看到的是
 * 「该时段刚被占用」——占用他的正是他自己，而页面没有任何办法说明这件事。
 *
 * 这里先把他自己的占位放掉，再跳回预约页。放不放得掉由 releasePendingHold
 * 判断（付过钱的绝不放），这个接口本身只负责跳转，任何情况下都不报错给客户看：
 * 放不掉也就是等 35 分钟，不该因此给一个失败页面。
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('b') ?? '';
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const back = lang === 'en' ? '/en/book/' : '/book/';

  // 订单号形如 bk_<9 字节 base64url>；格式不对就不查库，直接跳回去
  if (/^bk_[A-Za-z0-9_-]{1,40}$/.test(id)) {
    try {
      await releasePendingHold(id);
    } catch (err) {
      // 放不掉不影响客户回到预约页，记一笔就够了
      console.error('abandon: 释放占位失败', id, (err as Error).message);
    }
  }

  return new Response(null, {
    status: 303,
    headers: { Location: back, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
};
