import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { uploadFields } from '../../middlewares/upload.js'
import { badRequest, notFound } from '../../utils/HttpError.js'
import { ok, created } from '../../utils/response.js'
import { idParamSchema } from '../bookings/bookings.schema.js'
import { bookingListQuerySchema } from '../bookings/bookings.schema.js'
import { listBookings, getBookingDetail } from '../bookings/bookings.service.js'
import {
  listOwnerPayments, verifyPayment,
} from '../payments/payments.service.js'
import { listOwnerMaintenance, updateMaintenanceStatus, maintenanceStatusSchema } from '../maintenance/maintenance.service.js'
import {
  propertySchema, roomSchema, roomUpdateSchema, decisionSchema, verifyPaymentSchema, imageRoomSchema,
  imageIdParamSchema,
} from './owner.schema.js'
import { getOwnerDashboard } from './owner.dashboard.service.js'
import {
  listOwnerProperties, createProperty, updateProperty, deleteProperty,
  addPropertyImages, deleteImage, setCoverImage,
} from './owner.properties.service.js'
import { listOwnerRooms, createRoom, updateRoom, deleteRoom } from './owner.rooms.service.js'
import { decideBooking, completeBooking } from './owner.bookings.service.js'

const router = Router()

router.use(authenticate, requireRole('owner'))

router.get('/dashboard', async (req, res) => {
  ok(res, await getOwnerDashboard(req.user.id), 'OK')
})

// --- Properti ---

router.get('/properties', async (req, res) => {
  ok(res, await listOwnerProperties(req.user.id), 'OK')
})

router.post('/properties', validate(propertySchema), async (req, res) => {
  created(res, await createProperty(req.user.id, req.body), 'Properti berhasil dibuat dan menunggu verifikasi')
})

router.put('/properties/:id', validate(idParamSchema, 'params'), validate(propertySchema), async (req, res) => {
  const property = await updateProperty(req.user.id, req.validated.params.id, req.body)
  ok(res, property, 'Properti berhasil diperbarui')
})

router.delete('/properties/:id', validate(idParamSchema, 'params'), async (req, res) => {
  await deleteProperty(req.user.id, req.validated.params.id)
  ok(res, null, 'Properti berhasil dihapus')
})

router.post(
  '/properties/:id/images',
  validate(idParamSchema, 'params'),
  uploadFields([{ name: 'images', maxCount: 5 }]),
  async (req, res) => {
    const files = req.files?.images ?? []
    if (files.length === 0) throw badRequest('Minimal satu gambar wajib diunggah pada field "images"')

    const parsed = imageRoomSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || 'room_id', message: issue.message })),
      })
    }

    const images = await addPropertyImages(
      req.user.id, req.validated.params.id, files, parsed.data.room_id,
    )
    return created(res, images, 'Gambar berhasil diunggah')
  },
)

router.delete('/images/:imageId', validate(imageIdParamSchema, 'params'), async (req, res) => {
  await deleteImage(req.user.id, req.validated.params.imageId)
  ok(res, null, 'Gambar berhasil dihapus')
})

router.patch('/images/:imageId/cover', validate(imageIdParamSchema, 'params'), async (req, res) => {
  ok(res, await setCoverImage(req.user.id, req.validated.params.imageId), 'Gambar dijadikan cover')
})

// --- Kamar ---

router.get('/properties/:id/rooms', validate(idParamSchema, 'params'), async (req, res) => {
  ok(res, await listOwnerRooms(req.user.id, req.validated.params.id), 'OK')
})

router.post(
  '/properties/:id/rooms',
  validate(idParamSchema, 'params'),
  validate(roomSchema),
  async (req, res) => {
    const roomId = await createRoom(req.user.id, req.validated.params.id, req.body)
    const rooms = await listOwnerRooms(req.user.id, req.validated.params.id)
    created(res, rooms.find((room) => room.id === roomId) ?? null, 'Kamar berhasil dibuat')
  },
)

router.put('/rooms/:id', validate(idParamSchema, 'params'), validate(roomUpdateSchema), async (req, res) => {
  await updateRoom(req.user.id, req.validated.params.id, req.body)
  ok(res, null, 'Kamar berhasil diperbarui')
})

router.delete('/rooms/:id', validate(idParamSchema, 'params'), async (req, res) => {
  await deleteRoom(req.user.id, req.validated.params.id)
  ok(res, null, 'Kamar berhasil dihapus')
})

// --- Booking ---

router.get('/bookings', validate(bookingListQuerySchema, 'query'), async (req, res) => {
  ok(res, await listBookings({ ownerId: req.user.id, status: req.validated.query.status }), 'OK')
})

router.patch('/bookings/:id/decision', validate(idParamSchema, 'params'), validate(decisionSchema), async (req, res) => {
  ok(res, await decideBooking(req.user.id, req.validated.params.id, req.body), 'Keputusan booking disimpan')
})

router.patch('/bookings/:id/complete', validate(idParamSchema, 'params'), async (req, res) => {
  ok(res, await completeBooking(req.user.id, req.validated.params.id), 'Booking diselesaikan')
})

// --- Pembayaran ---

router.get('/payments', async (req, res) => {
  ok(res, await listOwnerPayments(req.user.id, req.query.status), 'OK')
})

router.patch('/payments/:id/verify', validate(idParamSchema, 'params'), validate(verifyPaymentSchema), async (req, res) => {
  ok(res, await verifyPayment(req.user.id, req.validated.params.id, req.body), 'Pembayaran diproses')
})

// --- Laporan kerusakan ---

router.get('/maintenance', async (req, res) => {
  ok(res, await listOwnerMaintenance(req.user.id, req.query.status), 'OK')
})

router.patch('/maintenance/:id', validate(idParamSchema, 'params'), validate(maintenanceStatusSchema), async (req, res) => {
  ok(res, await updateMaintenanceStatus(req.user.id, req.validated.params.id, req.body), 'Laporan diperbarui')
})

export default router
