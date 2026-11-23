// Tipe baris database yang dipakai lintas modul.
// Nilainya mengikuti bentuk objek response pada kontrak bagian 8.

export type Role = 'tenant' | 'owner' | 'admin'
export type AccountStatus = 'active' | 'suspended'

export type BookingStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED'

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE'
export type RoomStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE' | 'INACTIVE'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

/** Pengguna yang sedang login, hasil `loadUser` pada middleware auth. */
export interface UserRow {
  id: string
  full_name: string
  email: string
  phone_number: string | null
  avatar_url: string | null
  role: Role
  account_status: AccountStatus
  created_at: Date
}

/** Satu entri pada `errors` respons 422. */
export interface FieldError {
  field: string
  message: string
}
