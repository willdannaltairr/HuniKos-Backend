import type { Response } from 'express'

// Semua response memakai amplop yang sama: { success, message, data, meta? }.

export function ok<T>(res: Response, data: T, message = 'OK'): Response {
  return res.status(200).json({ success: true, message, data })
}

export function created<T>(res: Response, data: T, message: string): Response {
  return res.status(201).json({ success: true, message, data })
}

export function paginated<T>(
  res: Response,
  data: T,
  info: { page: number; limit: number; total: number },
): Response {
  return res.status(200).json({
    success: true,
    message: 'OK',
    data,
    meta: {
      page: info.page,
      limit: info.limit,
      total: info.total,
      total_pages: info.limit > 0 ? Math.ceil(info.total / info.limit) : 0,
    },
  })
}
