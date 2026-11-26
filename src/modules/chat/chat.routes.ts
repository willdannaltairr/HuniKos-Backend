import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { created, ok } from '../../utils/response.js'
import {
  assertActiveMember,
  createDirectRoom,
  deleteMessage,
  listMessages,
  listRooms,
  sendMessage,
} from './chat.service.js'
import {
  chatMessageIdSchema,
  chatRoomIdSchema,
  createDirectRoomSchema,
  listMessagesQuerySchema,
  sendMessageSchema,
} from './chat.schema.js'

// Semua rute chat butuh identitas pengguna: penjagaan akses memakai
// keanggotaan aktif, bukan peran semata.
const router = Router()

router.use(authenticate)

router.get('/rooms', async (req, res) => {
  ok(res, await listRooms(req.user.id), 'OK')
})

// Hanya penyewa yang memulai obrolan pribadi dengan pemilik properti.
router.post(
  '/direct',
  requireRole('tenant'),
  validate(createDirectRoomSchema),
  async (req, res) => {
    const room = await createDirectRoom(req.validated.body.property_id, req.user.id)
    created(res, room, 'Obrolan berhasil dibuka')
  },
)

router.get(
  '/rooms/:id/messages',
  validate(chatRoomIdSchema, 'params'),
  validate(listMessagesQuerySchema, 'query'),
  async (req, res) => {
    const { id } = req.validated.params
    const { before, limit } = req.validated.query
    // Service mengecek ulang keanggotaan di dalam transaksi yang sama dengan
    // penandaan "sudah dibaca" agar tidak ada celah antara dua query.
    ok(res, await listMessages(id, req.user.id, before, limit), 'OK')
  },
)

router.post(
  '/rooms/:id/messages',
  validate(chatRoomIdSchema, 'params'),
  validate(sendMessageSchema),
  async (req, res) => {
    const { id } = req.validated.params
    const message = await sendMessage(id, req.user.id, req.validated.body.content)
    created(res, message, 'Pesan berhasil dikirim')
  },
)

router.delete(
  '/rooms/:id/messages/:messageId',
  validate(chatMessageIdSchema, 'params'),
  async (req, res) => {
    const { id, messageId } = req.validated.params
    // Cek keanggotaan dulu supaya orang di luar ruangan dibedakan dari pesan
    // yang memang tidak ada; keduanya tetap 404.
    await assertActiveMember(id, req.user.id)
    await deleteMessage(id, messageId, req.user.id)
    ok(res, { deleted: true }, 'Pesan berhasil dihapus')
  },
)

export default router
