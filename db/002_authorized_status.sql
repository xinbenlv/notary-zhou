-- 改用「预授权、完成公证后再扣款」后，'paid' 不再准确：
-- 客户完成结账时资金只是被冻结，并没有真的扣走。把这一步单独叫作
-- 'authorized'，是为了让人一眼看出「这笔钱还没到账、且授权会在 7 天后失效」。
--
-- 状态流：held → authorized → completed（已扣款）
--                         ↘ cancelled（撤销授权，零手续费）
--                         ↘ expired（授权到期自动释放）
--
-- 占用判定必须把 authorized 算进去，否则已付款的单子不再占位，会被重复预约。
DROP INDEX IF EXISTS bookings_window_idx;
CREATE INDEX bookings_window_idx
  ON bookings (blocked_from, blocked_to)
  WHERE status IN ('held', 'authorized', 'paid', 'completed');

-- 扣款金额与时刻：授权额在 bookings.total_cents，实扣可能更少（签名处变少、
-- 或按退款档只扣一部分），必须分开记，退款与对账都靠这两列。
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS captured_cents  INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS captured_at     TIMESTAMPTZ;
-- 授权失效时刻，由 Stripe 的 charge.payment_method_details.card.capture_before 回填。
-- 超过这个时刻不扣款，钱就自动释放了——这是必须能查询的运营信息。
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS capture_before  TIMESTAMPTZ;
