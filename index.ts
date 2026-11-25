// Titik masuk Vercel. Platform mendeteksi berkas ini sebagai satu serverless function,
// lalu ALL request diteruskan ke aplikasi Express apa adanya (path /api/... tetap utuh).
// Lokal tidak memakai berkas ini: `npm run dev` menjalankan src/server.ts.
import { createApp } from './src/app.js'

export default createApp()
