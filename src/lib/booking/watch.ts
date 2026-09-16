// 运营巡检：定期把几件「会悄悄丢钱」的事翻出来。
//
// 这几件事有同一个共性——出问题时**没有任何人会被告知**：
//   1. 预授权到期：7 天一到 Stripe 自动释放资金，活白做了，也没有事件通知我们；
//   2. webhook 处理失败：Stripe 重试大约三天后放弃，而"放弃"本身不产生任何事件；
//   3. 订单卡在 held：客户的钱冻结着，日历上却没有这一单；
//   4. slot_holds 过期行：不再挡人（查询都带 expires_at > now()），但永远堆着。
//
// 本模块只负责查出来、给出结论；怎么通知由调用方决定。目前的通知手段是
// GitHub Actions 定时打 /api/admin/watch，有告警就让这一步非 0 退出，
// 借 GitHub 自带的"工作流失败"邮件把人叫醒——不引入新的邮件基础设施。

import { getPool } from './db.ts';
import { captureUrgency, CAPTURE_WARN_HOURS, type CaptureLevel } from './lifecycle.ts';

/** 卡在 held 超过这个小时数就不正常了：结账会话 30 分钟就该过期 */
export const STUCK_HELD_HOURS = 2;
/** 过期的 slot_holds 保留一天再清，方便出问题时回看是谁占过这个位子 */
export const SWEEP_KEEP_HOURS = 24;

export interface ExpiringBooking {
  id: string; startsAt: string; captureBefore: string;
  hoursLeft: number | null; level: CaptureLevel;
  totalCents: number; email: string | null; phone: string | null;
}

/**
 * 还没扣款、而授权快到期（或已经过期）的单子。
 * 这是整个巡检里最要紧的一项：到点之后钱直接释放，且不可逆。
 */
export async function expiringAuthorizations(withinHours = CAPTURE_WARN_HOURS): Promise<ExpiringBooking[]> {
  const { rows } = await getPool().query(
    `SELECT id, starts_at, capture_before, total_cents, email, phone
       FROM bookings
      WHERE status = 'authorized'
        AND capture_before IS NOT NULL
        AND capture_before <= now() + make_interval(hours => $1)
      ORDER BY capture_before`,
    [withinHours],
  );
  const now = new Date();
  return rows.map((r: any) => {
    const u = captureUrgency(r.capture_before, now);
    return {
      id: r.id,
      startsAt: new Date(r.starts_at).toISOString(),
      captureBefore: new Date(r.capture_before).toISOString(),
      hoursLeft: u.hoursLeft, level: u.level,
      totalCents: r.total_cents, email: r.email, phone: r.phone,
    };
  });
}

export interface LostAuthorization {
  id: string; startsAt: string; captureBefore: string | null;
  totalCents: number; email: string | null; phone: string | null;
  cancelReason: string | null; endedAt: string;
}

/**
 * 授权已经到期、钱没收到的单子。
 *
 * `payment_intent_id IS NOT NULL` 是关键的区分条件：expired 这个状态下有两类单，
 * 一类是"结账就没完成、从来没付过钱"（无 payment_intent，什么也没损失），
 * 一类是"付了钱、授权到期"——只有后者是真的丢了一笔该收的钱。
 */
export async function expiredAuthorizations(withinDays = 30): Promise<LostAuthorization[]> {
  const { rows } = await getPool().query(
    `SELECT id, starts_at, capture_before, total_cents, email, phone, cancel_reason, updated_at
       FROM bookings
      WHERE status = 'expired'
        AND payment_intent_id IS NOT NULL
        AND updated_at > now() - make_interval(days => $1)
      ORDER BY updated_at DESC`,
    [withinDays],
  );
  return rows.map((r: any) => ({
    id: r.id,
    startsAt: new Date(r.starts_at).toISOString(),
    captureBefore: r.capture_before ? new Date(r.capture_before).toISOString() : null,
    totalCents: r.total_cents, email: r.email, phone: r.phone,
    cancelReason: r.cancel_reason, endedAt: new Date(r.updated_at).toISOString(),
  }));
}

export interface StuckBooking {
  id: string; startsAt: string; createdAt: string; totalCents: number;
  checkoutSessionId: string | null;
}

/** 卡在 held 的单子。正常路径下 30 分钟内必然离开这个状态。 */
export async function stuckHeldBookings(olderThanHours = STUCK_HELD_HOURS): Promise<StuckBooking[]> {
  const { rows } = await getPool().query(
    `SELECT id, starts_at, created_at, total_cents, checkout_session_id
       FROM bookings
      WHERE status = 'held' AND created_at < now() - make_interval(hours => $1)
      ORDER BY created_at`,
    [olderThanHours],
  );
  return rows.map((r: any) => ({
    id: r.id,
    startsAt: new Date(r.starts_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    totalCents: r.total_cents, checkoutSessionId: r.checkout_session_id,
  }));
}

export interface OpenWebhookFailure {
  eventId: string; type: string; attempts: number;
  firstFailedAt: string; lastFailedAt: string; lastError: string | null;
}

/** 还没被重试成功的 webhook。Stripe 放弃重试不会通知我们，这里是唯一的线索。 */
export async function openWebhookFailures(limit = 50): Promise<OpenWebhookFailure[]> {
  const { rows } = await getPool().query(
    `SELECT event_id, type, attempts, first_failed_at, last_failed_at, last_error
       FROM webhook_failures
      WHERE resolved_at IS NULL
      ORDER BY first_failed_at
      LIMIT $1`, [limit]);
  return rows.map((r: any) => ({
    eventId: r.event_id, type: r.type, attempts: r.attempts,
    firstFailedAt: new Date(r.first_failed_at).toISOString(),
    lastFailedAt: new Date(r.last_failed_at).toISOString(),
    lastError: r.last_error,
  }));
}

/** 清掉早就失效的时段保留。返回删掉的行数。 */
export async function sweepSlotHolds(keepHours = SWEEP_KEEP_HOURS): Promise<number> {
  const { rowCount } = await getPool().query(
    'DELETE FROM slot_holds WHERE expires_at < now() - make_interval(hours => $1)',
    [keepHours],
  );
  return rowCount ?? 0;
}

export interface WatchReport {
  ok: boolean;
  checkedAt: string;
  alerts: string[];
  expiringSoon: ExpiringBooking[];
  expiredUncaptured: LostAuthorization[];
  stuckHeld: StuckBooking[];
  webhookFailures: OpenWebhookFailure[];
  sweptSlotHolds: number;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export interface WatchFindings {
  expiringSoon: ExpiringBooking[];
  expiredUncaptured: LostAuthorization[];
  stuckHeld: StuckBooking[];
  webhookFailures: OpenWebhookFailure[];
}

/**
 * 把查到的东西翻译成人能看懂的告警。
 * 单独拎出来是因为「什么算值得报警」是这套巡检里唯一需要判断的地方，
 * 其余都是查询；没有告警和漏掉告警在这里是同一种故障。
 */
export function buildAlerts(f: WatchFindings): string[] {
  const alerts: string[] = [];
  for (const b of f.expiringSoon) {
    alerts.push(b.level === 'expired'
      ? `订单 ${b.id}（${money(b.totalCents)}）的预授权已过期但仍是 authorized，钱可能已经释放`
      : `订单 ${b.id}（${money(b.totalCents)}）还有 ${b.hoursLeft} 小时到期，需尽快扣款`);
  }
  for (const b of f.expiredUncaptured) {
    alerts.push(`订单 ${b.id}（${money(b.totalCents)}）预授权已到期未扣款，这笔钱没有收到`);
  }
  for (const b of f.stuckHeld) {
    alerts.push(`订单 ${b.id} 卡在 held 已超过 ${STUCK_HELD_HOURS} 小时，可能是 webhook 没落地`);
  }
  for (const w of f.webhookFailures) {
    alerts.push(`webhook ${w.type}（${w.eventId}）已失败 ${w.attempts} 次仍未成功：${w.lastError ?? ''}`);
  }
  return alerts;
}

/**
 * 跑一遍巡检并给出结论。
 * `ok === false` 就是「需要有人立刻去看一眼」，调用方据此决定是否报警。
 */
export async function runWatch(withinHours = CAPTURE_WARN_HOURS): Promise<WatchReport> {
  const [expiringSoon, expiredUncaptured, stuckHeld, webhookFailures, sweptSlotHolds] =
    await Promise.all([
      expiringAuthorizations(withinHours),
      expiredAuthorizations(),
      stuckHeldBookings(),
      openWebhookFailures(),
      sweepSlotHolds(),
    ]);

  const alerts = buildAlerts({ expiringSoon, expiredUncaptured, stuckHeld, webhookFailures });

  return {
    ok: alerts.length === 0,
    checkedAt: new Date().toISOString(),
    alerts, expiringSoon, expiredUncaptured, stuckHeld, webhookFailures, sweptSlotHolds,
  };
}
