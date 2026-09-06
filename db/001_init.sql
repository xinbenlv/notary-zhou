-- 预约系统建表。故意用普通 SQL 而非 ORM：表结构简单，且计价快照必须原样留存。
-- 金额一律以「美分整数」存储，避免浮点误差；与 Stripe 的最小货币单位一致。

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,              -- bk_<random>，对外可见
  status            TEXT NOT NULL,                 -- held|paid|completed|cancelled|refunded|expired
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 时间：全部存 UTC；展示时转 America/Los_Angeles
  starts_at         TIMESTAMPTZ NOT NULL,          -- 预约时刻 T
  service_minutes   INTEGER     NOT NULL,          -- ceil(签名处/3)*15
  -- 完整占用窗口（出发→返回），排期冲突以此为准，而非 starts_at
  blocked_from      TIMESTAMPTZ NOT NULL,
  blocked_to        TIMESTAMPTZ NOT NULL,

  -- 地点
  location_kind     TEXT NOT NULL,                 -- park|mobile
  address           TEXT,                          -- Google 规范化后的地址
  place_id          TEXT,
  outbound_minutes  INTEGER,                       -- 该时段的预测去程分钟
  return_minutes    INTEGER,

  -- 计价快照：系数会随时间调整，退款必须按「当时收了多少」算
  notary_fee_cents  INTEGER NOT NULL,
  travel_fee_cents  INTEGER NOT NULL,
  total_cents       INTEGER NOT NULL,
  pricing_snapshot  JSONB   NOT NULL,              -- {base, perMin, legs, actsPaid, actsWaived, ...}

  -- 文件与签署人（整体存 JSON：只随订单读写，不需要独立查询）
  documents         JSONB   NOT NULL,              -- [{type, act, name?, signers:[{name, idType, count}]}]
  signers           JSONB   NOT NULL,

  -- 客户联系方式：来自 Stripe Checkout，付款后由 webhook 回填
  email             TEXT,
  phone             TEXT,

  -- Stripe
  checkout_session_id TEXT UNIQUE,
  payment_intent_id   TEXT,
  refund_id           TEXT,
  refunded_cents      INTEGER NOT NULL DEFAULT 0,

  -- Google Calendar：三个事件（服务本身、去程、回程）
  event_id_service  TEXT,
  event_id_outbound TEXT,
  event_id_return   TEXT,

  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT
);

-- 查空闲时段时按时间范围扫描；只有未取消的订单才占用日程
CREATE INDEX IF NOT EXISTS bookings_window_idx
  ON bookings (blocked_from, blocked_to)
  WHERE status IN ('held', 'paid', 'completed');

CREATE INDEX IF NOT EXISTS bookings_status_created_idx ON bookings (status, created_at DESC);

-- 时段临时保留：客户进入结账但尚未付款期间占位，过期自动失效。
-- 单独建表而非复用 bookings.status='held'，是为了让过期清理不碰订单数据。
CREATE TABLE IF NOT EXISTS slot_holds (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  blocked_from   TIMESTAMPTZ NOT NULL,
  blocked_to     TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slot_holds_active_idx ON slot_holds (expires_at, blocked_from, blocked_to);

-- Stripe webhook 幂等：Stripe 会重试推送，同一 event 必须只处理一次
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
