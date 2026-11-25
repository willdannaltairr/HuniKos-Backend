-- Up Migration
-- Pembayaran beralih ke Midtrans Snap, sehingga bukti transfer tidak wajib lagi.
ALTER TABLE payments ALTER COLUMN proof_url DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN storage_key DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN midtrans_order_id VARCHAR(60),
  ADD COLUMN midtrans_snap_token TEXT,
  ADD COLUMN midtrans_redirect_url TEXT,
  ADD COLUMN midtrans_transaction_id VARCHAR(100),
  ADD COLUMN midtrans_transaction_status VARCHAR(20),
  ADD COLUMN midtrans_payment_type VARCHAR(40),
  ADD COLUMN midtrans_fraud_status VARCHAR(10);

CREATE UNIQUE INDEX idx_payments_midtrans_order_id ON payments (midtrans_order_id);

-- Down Migration
DROP INDEX IF EXISTS idx_payments_midtrans_order_id;
ALTER TABLE payments
  DROP COLUMN IF EXISTS midtrans_order_id,
  DROP COLUMN IF EXISTS midtrans_snap_token,
  DROP COLUMN IF EXISTS midtrans_redirect_url,
  DROP COLUMN IF EXISTS midtrans_transaction_id,
  DROP COLUMN IF EXISTS midtrans_transaction_status,
  DROP COLUMN IF EXISTS midtrans_payment_type,
  DROP COLUMN IF EXISTS midtrans_fraud_status;
ALTER TABLE payments ALTER COLUMN proof_url SET NOT NULL;
ALTER TABLE payments ALTER COLUMN storage_key SET NOT NULL;
