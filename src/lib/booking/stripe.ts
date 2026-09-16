// Stripe REST 封装。
//
// 不用官方 SDK：16 MB 的包只为了五个调用不划算，与 calendar.ts 避开
// googleapis 是同一个取舍。代价是 webhook 验签要自己写——所以这里
// 刻意写得啰嗦一点，并由 tests/stripe.test.mjs 单独覆盖（验签不需要密钥，
// 本地就能构造签名，反而比"用了 SDK 但从没测过"更可靠）。

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

function secretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error('STRIPE_SECRET_KEY 未设置');
  return k;
}

/** 当前跑的是不是测试密钥。用于在页面和日志上标明，避免把测试单当真单。 */
export const isTestMode = (): boolean => (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');

/**
 * Stripe 用的是表单编码，嵌套结构写成 a[b][0][c]=v。
 * undefined 一律跳过（不是发空串）：Stripe 会把空串当成"显式清空"。
 */
export function formEncode(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj === undefined || obj === null) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out));
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      formEncode(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out;
}

interface StripeError { error?: { message?: string; code?: string; type?: string } }

async function stripeFetch<T>(
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    // 固定 API 版本：Stripe 升级默认版本时字段会变，不能让线上跟着漂
    'Stripe-Version': '2025-08-27.basil',
  };
  // 重试同一个 key 不会重复扣款——建 Session 与 capture 都必须带
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method: params ? 'POST' : 'GET',
    headers,
    body: params ? formEncode(params).join('&') : undefined,
  });
  const json = (await res.json()) as T & StripeError;
  if (!res.ok) {
    throw new Error(`Stripe ${path}: ${json.error?.message ?? res.status}`);
  }
  return json;
}

// ── Checkout ────────────────────────────────────────────────

export interface CheckoutLine { name: string; description?: string; amountCents: number }

export interface CheckoutArgs {
  bookingId: string;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  /** Session 过期时刻，与我们自己的时段保留同步（Stripe 要求 30 分钟–24 小时） */
  expiresAt: Date;
  metadata: Record<string, string>;
  locale?: 'zh' | 'en';
}

export interface CheckoutSession { id: string; url: string; payment_intent: string | null; expires_at: number }

/**
 * 只收银行卡用的 payment method configuration（pmc_...）。
 *
 * 为什么不能只靠 `payment_method_types: ['card']`：实测下来那一行**挡不住 Link**。
 * 会话接口确实回报 payment_method_types=["card"]，但结账页照样渲染出
 * `link_instant_debit` 与 `link_klarna` 两个可选项，前者还挂着"返现 US$5"的角标
 * 主动把人往银行扣款那条路上引。原因在 Stripe 文档里写着：card 这个类型
 * "supported through many networks, card brands, and **select Link funding sources**"
 * ——Link 的这些资金来源在 Stripe 眼里就属于 card，列 card 自然排除不掉它们。
 *
 * 而银行扣款根本不支持预授权：拿 us_bank_account 建 capture_method=manual 的
 * PaymentIntent 会被直接拒绝（"`capture_method=manual` is not supported by
 * payment method type `us_bank_account`"）。一旦客户走 Link 的银行通道付款，
 * 「7 天内扣款」这个前提就不成立了，而整个 2–7 天的预约窗口都建立在它上面。
 *
 * 唯一能真正关掉的开关是 payment method configuration（文档原话：Link 只能
 * 在各个 payment method configuration 里逐个关闭），它与 payment_method_types
 * 互斥，所以配置了就用它、并且不再传 payment_method_types。
 * 用"白名单"（配置里只开 card）而不是 excluded_payment_method_types 的黑名单：
 * Stripe 会自己加新的付款方式，黑名单挡不住还没出现的那些。
 */
const cardOnlyConfiguration = (): string | null =>
  process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION?.trim() || null;

/**
 * 建结账会话。**capture_method=manual**：只预授权、不扣款，
 * 公证完成后再按实际金额 capture（可少于授权额，余额自动释放）。
 */
export function checkoutSessionParams(args: CheckoutArgs): Record<string, unknown> {
  const pmc = cardOnlyConfiguration();
  return {
    mode: 'payment',
    ...(pmc
      ? { payment_method_configuration: pmc }
      : { payment_method_types: ['card'] }),
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    expires_at: Math.floor(args.expiresAt.getTime() / 1000),
    client_reference_id: args.bookingId,
    locale: args.locale === 'en' ? 'en' : 'zh',
    phone_number_collection: { enabled: true },
    payment_intent_data: {
      capture_method: 'manual',
      metadata: args.metadata,
      // 对账单上要能看出是哪一单，否则预授权容易被当成陌生扣款而拒付
      statement_descriptor_suffix: 'NOTARY',
    },
    metadata: args.metadata,
    line_items: args.lines.map((l) => ({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: l.amountCents,
        product_data: { name: l.name, description: l.description },
      },
    })),
  };
}

export async function createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
  if (!cardOnlyConfiguration()) {
    // 没配就退回原来的写法：仍然只声明 card，但 Link 的银行/Klarna 通道会漏进来。
    // 这里不硬失败——挡掉一笔可能有问题的付款，好过让所有人都下不了单。
    console.warn('[booking] STRIPE_PAYMENT_METHOD_CONFIGURATION 未设置：'
      + '结账页可能出现 Link 的银行扣款选项，那条路不支持预授权');
  }
  return stripeFetch<CheckoutSession>('/checkout/sessions',
    checkoutSessionParams(args), `checkout:${args.bookingId}`);
}

export interface PaymentIntent {
  id: string;
  status: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
  latest_charge?: unknown;
}

export const getCheckoutSession = (id: string) =>
  stripeFetch<CheckoutSession & {
    /** open | complete | expired —— 判断客户是否已经付过，别用 payment_status */
    status: string;
    payment_status: string;
    customer_details?: { email?: string; phone?: string };
  }>(`/checkout/sessions/${encodeURIComponent(id)}`);

/**
 * 扣款。amountCents 可低于授权额，余额自动释放；**一笔授权只能扣一次**，
 * 所以当天若签名处变多，必须另开一笔，不能指望再 capture 一次。
 */
/** 取 PaymentIntent，展开 latest_charge 以便读授权到期时刻 capture_before */
export const getPaymentIntent = (id: string) =>
  stripeFetch<PaymentIntent & {
    latest_charge?: { payment_method_details?: { card?: { capture_before?: number } } };
  }>(`/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`);

export const capturePaymentIntent = (id: string, amountCents: number) =>
  stripeFetch<PaymentIntent>(`/payment_intents/${encodeURIComponent(id)}/capture`,
    { amount_to_capture: amountCents }, `capture:${id}:${amountCents}`);

/** 撤销预授权，资金立即释放，且不产生任何手续费 */
export const cancelPaymentIntent = (id: string, reason = 'requested_by_customer') =>
  stripeFetch<PaymentIntent>(`/payment_intents/${encodeURIComponent(id)}/cancel`,
    { cancellation_reason: reason }, `cancel:${id}`);

// ── Webhook 验签 ─────────────────────────────────────────────

export interface StripeEvent { id: string; type: string; data: { object: Record<string, unknown> } }

/** 默认容忍 5 分钟时钟偏差，与 Stripe 官方 SDK 一致 */
export const WEBHOOK_TOLERANCE_SEC = 300;

/**
 * 校验 Stripe-Signature 并解析事件。
 *
 * 头格式：`t=<unix>,v1=<hex>,v1=<hex>`（轮换密钥期间会有多个 v1）。
 * 签名对象是 `${t}.${rawBody}` —— 必须用**原始请求体**，
 * JSON.parse 再 stringify 会改变字节序列，签名必然对不上。
 *
 * 任何一步不通过都抛错。这里绝不能"验不了就放行"：
 * 放行意味着任何人都能伪造一条 checkout.session.completed 造出已付款的订单。
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = WEBHOOK_TOLERANCE_SEC,
): StripeEvent {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET 未设置');
  if (!signatureHeader) throw new Error('缺少 Stripe-Signature 头');

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp)) throw new Error('签名头缺少合法的时间戳');
  if (!signatures.length) throw new Error('签名头缺少 v1 签名');

  // 时间戳校验挡的是重放：签名本身永远有效，不限时就能被无限次重放
  const age = Math.abs(nowSec - Number(timestamp));
  if (age > toleranceSec) throw new Error(`签名时间戳超出容忍范围（${age}s）`);

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const matched = signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const given = Buffer.from(sig, 'hex');
    // 长度不等时 timingSafeEqual 会抛错，必须先挡掉
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new Error('签名不匹配');

  return JSON.parse(rawBody) as StripeEvent;
}
