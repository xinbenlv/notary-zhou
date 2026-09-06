// 计价与排期的纯函数。刻意不做任何 I/O：车程分钟数由调用方传入，
// 这样定价规则可以完整单测，而不需要真的去调 Google。
//
// 法律依据：加州政府法典 §8211 规定公证费上限「每个被公证的签名 $15」。
// 交通费不受 §8211 约束，但必须事先告知并经客户同意。

export const NOTARY_FEE_CENTS = 1500;          // §8211 每个签名处上限
export const TRAVEL_BASE_CENTS = 500;          // 起步价，一次预约计一次
export const TRAVEL_PER_MIN_CENTS = 215;       // $2.15/分钟，按往返总分钟数
export const STRIPE_PCT = 0.029;
export const STRIPE_FIXED_CENTS = 30;

export const ARRIVE_EARLY_MIN = 15;            // 提前到达的缓冲
export const DEPART_BUFFER_MIN = 15;           // 服务结束后再出发的缓冲
export const MIN_SERVICE_MIN = 15;
export const ACTS_PER_BLOCK = 3;               // 每 3 个签名处算 15 分钟

export type ActType = 'ack' | 'jurat' | 'unsure';
export type FeeRule = 'standard' | 'free' | 'imm' | 'copy' | 'depo';

export interface DocSigner { name: string; count: number }
export interface BookingDoc {
  typeKey: string;
  rule: FeeRule;
  act?: ActType;
  parts: DocSigner[];
}

/** 该文件实际发生的公证行为数（用于时长与计费） */
export function docActs(doc: BookingDoc): number {
  if (doc.rule === 'copy' || doc.rule === 'depo') return 1;
  return doc.parts.reduce((n, p) => n + p.count, 0);
}

/** 该文件的公证费（美分）。免费类计 0，但仍占用服务时长。 */
export function docFeeCents(doc: BookingDoc): number {
  switch (doc.rule) {
    case 'free': return 0;
    case 'copy': return NOTARY_FEE_CENTS;              // 核证副本 $15/份
    case 'depo': return 3000 + 700 + 700;              // 取证 $30 + 宣誓 $7 + 证书 $7
    case 'imm':  return NOTARY_FEE_CENTS * doc.parts.length;  // 移民表格：每人封顶 $15
    default:     return NOTARY_FEE_CENTS * docActs(doc);
  }
}

export function notaryFeeCents(docs: BookingDoc[]): number {
  return docs.reduce((sum, d) => sum + docFeeCents(d), 0);
}

export function totalActs(docs: BookingDoc[]): number {
  return docs.reduce((n, d) => n + docActs(d), 0);
}

export function waivedActs(docs: BookingDoc[]): number {
  return docs.filter((d) => d.rule === 'free').reduce((n, d) => n + docActs(d), 0);
}

/** 服务时长：每 3 个签名处 15 分钟，向上取整，至少 15 分钟 */
export function serviceMinutes(docs: BookingDoc[]): number {
  const acts = totalActs(docs);
  return Math.max(MIN_SERVICE_MIN, Math.ceil(acts / ACTS_PER_BLOCK) * MIN_SERVICE_MIN);
}

/** 交通费原始金额（未含手续费与取整）。Lakewood Park 自取为 0。 */
export function travelRawCents(outboundMin: number, returnMin: number): number {
  if (outboundMin <= 0 && returnMin <= 0) return 0;
  return TRAVEL_BASE_CENTS + TRAVEL_PER_MIN_CENTS * (outboundMin + returnMin);
}

const ceilTo = (cents: number, step: number) => Math.ceil(cents / step) * step;

export interface Quote {
  notaryFeeCents: number;
  travelFeeCents: number;
  totalCents: number;
  serviceMinutes: number;
  actsTotal: number;
  actsWaived: number;
}

/**
 * 总价 = 上浮 Stripe 手续费后向上取整到 $5。
 * 手续费与取整的零头全部落在「交通费」这一行——公证费行必须恒等于
 * 法定的 $15×n，多收一分都可能违反 §8211。
 * 自取（无车程）时不上浮：公证费不能因手续费而超过法定上限。
 */
export function quote(docs: BookingDoc[], outboundMin: number, returnMin: number): Quote {
  const notary = notaryFeeCents(docs);
  const travelRaw = travelRawCents(outboundMin, returnMin);

  let total: number;
  if (travelRaw === 0) {
    total = notary;                                   // 无交通费可承载上浮，只能吸收
  } else {
    const grossed = (notary + travelRaw + STRIPE_FIXED_CENTS) / (1 - STRIPE_PCT);
    total = ceilTo(Math.round(grossed), 500);
  }

  return {
    notaryFeeCents: notary,
    travelFeeCents: total - notary,
    totalCents: total,
    serviceMinutes: serviceMinutes(docs),
    actsTotal: totalActs(docs),
    actsWaived: waivedActs(docs),
  };
}

/**
 * 完整占用窗口：提前 15 分钟到达 → 服务 → 结束后 15 分钟才出发 → 回到出发地。
 * 排期冲突判定用这个窗口，而不是预约时刻本身。
 */
export function blockWindow(
  startsAt: Date, serviceMin: number, outboundMin: number, returnMin: number
): { from: Date; to: Date } {
  const t = startsAt.getTime();
  return {
    from: new Date(t - (outboundMin + ARRIVE_EARLY_MIN) * 60_000),
    to: new Date(t + (serviceMin + DEPART_BUFFER_MIN + returnMin) * 60_000),
  };
}

export type RefundTier = 'full' | 'half_travel' | 'notary_only';

/** 三档退款政策：>48h 全退；24–48h 退公证费+半数交通费；<24h/爽约 只退公证费 */
export function refundTier(startsAt: Date, now: Date = new Date()): RefundTier {
  const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hours >= 48) return 'full';
  if (hours >= 24) return 'half_travel';
  return 'notary_only';
}

export function refundCents(
  paid: { notaryFeeCents: number; travelFeeCents: number },
  tier: RefundTier
): number {
  switch (tier) {
    case 'full':        return paid.notaryFeeCents + paid.travelFeeCents;
    case 'half_travel': return paid.notaryFeeCents + Math.floor(paid.travelFeeCents / 2);
    case 'notary_only': return paid.notaryFeeCents;
  }
}
