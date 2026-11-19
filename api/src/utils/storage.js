import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../')
export const UPLOAD_DIR = path.join(ROOT, 'uploads')

if (env.storageDriver === 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

async function saveLocal(file, folder, ext) {
  const fileName = `${randomUUID()}.${ext}`
  const directory = path.join(UPLOAD_DIR, folder)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), file.buffer)

  const key = path.posix.join(folder, fileName)
  return { url: `${env.baseUrl}/uploads/${key}`, key }
}

function saveCloudinary(file, folder, ext) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `hunikos/${folder}`, resource_type: 'image', format: ext },
      (error, result) => {
        if (error) return reject(error)
        return resolve({ url: result.secure_url, key: result.public_id })
      },
    )
    stream.end(file.buffer)
  })
}

// ext berasal dari tipe hasil deteksi magic bytes, bukan dari nama file kiriman client.
export async function saveFile(file, folder, ext) {
  if (env.storageDriver === 'cloudinary') return saveCloudinary(file, folder, ext)
  return saveLocal(file, folder, ext)
}

// Best-effort: file yang gagal dihapus hanya dicatat di log, tidak menggagalkan request.
export async function deleteFile(key) {
  try {
    if (env.storageDriver === 'cloudinary') {
      await cloudinary.uploader.destroy(key)
      return
    }
    await unlink(path.join(UPLOAD_DIR, key))
  } catch (error) {
    console.warn(`Gagal menghapus file ${key}: ${error.message}`)
  }
}
