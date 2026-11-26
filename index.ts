// Titik masuk Vercel. Platform mendeteksi berkas ini sebagai satu serverless function,
// lalu ALL request diteruskan ke aplikasi Express apa adanya (path /api/... tetap utuh).
// Import tipe Express juga memberi penanda yang dicari detektor entry Express Vercel.
// Lokal tidak memakai berkas ini: `npm run dev` menjalankan src/localServer.ts.
import type { Express } from 'express'
import { createApp } from './src/createApp.js'

const app: Express = createApp()
export default app
