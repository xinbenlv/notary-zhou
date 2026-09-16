-- Webhook 处理失败的留痕。
--
-- 原来的做法是：处理器抛错就把 processed_events 里的幂等行删掉再返回 500，
-- 让 Stripe 重试。这在「重试能成功」时是对的，但 Stripe 大约三天后就放弃了，
-- 而放弃这件事**不会**产生任何事件——没人会被告知。于是订单停在 held、
-- 客户的钱还冻结着、日历上没有这一单，而我们一无所知。
--
-- 所以幂等行照删（重试仍要能进来），但另开一张表把失败留下来：
-- 重试成功时标记 resolved_at，一直没成功的行就是「Stripe 已经放弃」的证据。
CREATE TABLE IF NOT EXISTS webhook_failures (
  event_id        TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  -- 原始事件体：Stripe 放弃后想补救就只能靠它，没有就只能手工拼
  payload         JSONB,
  resolved_at     TIMESTAMPTZ
);

-- 告警只关心「还没解决的」，按最早失败时间排前面
CREATE INDEX IF NOT EXISTS webhook_failures_open_idx
  ON webhook_failures (first_failed_at)
  WHERE resolved_at IS NULL;

-- 过期的临时保留只是不再生效（查询都带 expires_at > now()），但一行不删，
-- 会一直堆下去。留一天再清，方便出问题时回看「当时是谁占着这个位子」。
CREATE INDEX IF NOT EXISTS slot_holds_expires_idx ON slot_holds (expires_at);
