// Semua response memakai amplop yang sama sesuai kontrak bagian 6.
export function ok(res, data, message = 'OK') {
  return res.status(200).json({ success: true, message, data })
}

export function created(res, data, message) {
  return res.status(201).json({ success: true, message, data })
}

export function paginated(res, data, meta, message = 'OK') {
  return res.status(200).json({ success: true, message, data, meta })
}

export function buildMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  }
}
