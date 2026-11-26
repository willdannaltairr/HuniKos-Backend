// Perhitungan biaya platform. Semua nominal dibulatkan ke rupiah penuh supaya
// cocok dengan gross_amount Midtrans, yang tidak menerima desimal.

export type FeeBreakdown = {
  base_amount: number
  tenant_fee: number
  total_tenant_payment: number
  owner_fee: number
  owner_net_payout: number
  platform_gross_revenue: number
}

/**
 * Booking lama (fee_applicable = false) sengaja dikembalikan dengan fee 0.
 * Penyewa yang sudah menunggu bayar sebelum fitur ini tidak ditagih tambahan.
 */
export function hitungFee(baseAmount: number, options: {
  feeApplicable: boolean
  isOwnerPromo: boolean
}): FeeBreakdown {
  const base = Math.round(baseAmount)
  if (!options.feeApplicable) {
    return {
      base_amount: base,
      tenant_fee: 0,
      total_tenant_payment: base,
      owner_fee: 0,
      owner_net_payout: base,
      platform_gross_revenue: 0,
    }
  }

  const tenantFee = Math.round(base * 0.02)
  const ownerFee = options.isOwnerPromo ? 0 : Math.round(base * 0.02)

  return {
    base_amount: base,
    tenant_fee: tenantFee,
    total_tenant_payment: base + tenantFee,
    owner_fee: ownerFee,
    owner_net_payout: base - ownerFee,
    platform_gross_revenue: tenantFee + ownerFee,
  }
}
