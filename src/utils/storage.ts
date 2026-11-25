import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

// Semua gambar disimpan di Cloudinary, bukan di disk server.
cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
})

export interface SavedFile {
  url: string // alamat gambar yang bisa dibuka di browser
  key: string // public_id Cloudinary, dipakai saat menghapus
}

// Unggah satu buffer gambar ke folder Cloudinary, lalu kembalikan URL dan key-nya.
export function saveFile(buffer: Buffer, folder: string, ext: string): Promise<SavedFile> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `hunikos/${folder}`, resource_type: 'image', format: ext },
      (error, result) => {
        if (error) return reject(error)
        if (!result) return reject(new Error('Cloudinary tidak mengembalikan hasil unggah'))
        return resolve({ url: result.secure_url, key: result.public_id })
      },
    )
    stream.end(buffer)
  })
}

// Hapus gambar di Cloudinary. Kalau gagal, cukup dicatat; request tetap dianggap berhasil.
export async function deleteFile(key: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(key)
  } catch (error) {
    console.warn(`Gagal menghapus file ${key}: ${(error as Error).message}`)
  }
}
