import type { Response } from 'express'

/** Bagian `meta` untuk endpoint berpaginasi. */
export interface PaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

// Semua response memakai amplop yang sama sesuai kontrak bagian 6.
export function ok<T>(res: Response, data: T, message = 'OK'): Response {
  return res.status(200).json({ success: true, message, data })
}

export function created<T>(res: Response, data: T, message: string): Response {
  return res.status(201).json({ success: true, message, data })
}

export function paginated<T>(res: Response, data: T, meta: PaginationMeta, message = 'OK'): Response {
  return res.status(200).json({ success: true, message, data, meta })
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  }
}
