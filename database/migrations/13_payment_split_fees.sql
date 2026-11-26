-- Up Migration
-- Rincian biaya platform disimpan per pembayaran supaya mudah diaudit.
-- Data lama tetap memakai 0: booking yang sudah berjalan tidak ditagih tambahan.
ALTER TABLE payments
  ADD COLUMN base_amount NUMERIC(14, 2),
  ADD COLUMN tenant_fee NUMERIC(14, 2),
  ADD COLUMN total_tenant_payment NUMERIC(14, 2),
  ADD COLUMN owner_fee NUMERIC(14, 2),
  ADD COLUMN owner_net_payout NUMERIC(14, 2),
  ADD COLUMN platform_gross_revenue NUMERIC(14, 2);

-- Payment lama tidak punya rincian biaya. Anggap base = amount, sisanya nol.
UPDATE payments
   SET base_amount = amount,
       tenant_fee = 0,
       total_tenant_payment = amount,
       owner_fee = 0,
       owner_net_payout = amount,
       platform_gross_revenue = 0
 WHERE base_amount IS NULL;

ALTER TABLE payments ALTER COLUMN base_amount SET NOT NULL;
ALTER TABLE payments ALTER COLUMN tenant_fee SET NOT NULL;
ALTER TABLE payments ALTER COLUMN total_tenant_payment SET NOT NULL;
ALTER TABLE payments ALTER COLUMN owner_fee SET NOT NULL;
ALTER TABLE payments ALTER COLUMN owner_net_payout SET NOT NULL;
ALTER TABLE payments ALTER COLUMN platform_gross_revenue SET NOT NULL;

-- Promo pemilik kos baru: admin menyalakan/mematikan per properti.
-- Saat aktif, owner_fee = 0 sehingga pemilik menerima seluruh base_amount.
ALTER TABLE properties ADD COLUMN is_owner_promo BOOLEAN NOT NULL DEFAULT false;

-- Booking yang sudah ada tidak boleh ditagih 2% saat dibayar nanti.
-- booking baru menuliskan true secara eksplisit dari aplikasi.
ALTER TABLE bookings ADD COLUMN fee_applicable BOOLEAN NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE bookings DROP COLUMN IF EXISTS fee_applicable;
ALTER TABLE properties DROP COLUMN IF EXISTS is_owner_promo;
ALTER TABLE payments
  DROP COLUMN IF EXISTS platform_gross_revenue,
  DROP COLUMN IF EXISTS owner_net_payout,
  DROP COLUMN IF EXISTS owner_fee,
  DROP COLUMN IF EXISTS total_tenant_payment,
  DROP COLUMN IF EXISTS tenant_fee,
  DROP COLUMN IF EXISTS base_amount;
