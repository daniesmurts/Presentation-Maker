import { Router, json } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { ValidationError } from '../errors/AppError'
import { logger } from '../lib/logger'
import { billingView, startCheckout, verifyOrder, setAutoRenewFor, applyNotification, NotificationRejected } from '../services/billing'

// Two routers: the T-Bank webhook is server-to-server (no session cookie, no
// X-Requested-With) and is authenticated by its signature instead; the rest
// is the user's own billing page.

export const billingWebhookRouter = Router()

// POST /api/billing/tbank/notify — T-Bank posts JSON; we must answer 200 with
// the body «OK» (exactly) or it retries hourly for a day, then daily for a
// month. That retry is the safety net, so anything we could not apply is a
// non-200 on purpose: a bad signature is 403 (someone else), an order we do
// not know is 404 (a bug on our side — retries buy time to fix it).
billingWebhookRouter.post('/tbank/notify', json({ limit: '64kb' }), asyncHandler(async (req, res) => {
  try {
    const { orderId, applied } = await applyNotification((req.body ?? {}) as Parameters<typeof applyNotification>[0])
    logger.info({ message: 'T-Bank notification', orderId, status: (req.body as { Status?: string })?.Status, applied })
    res.type('text/plain').send('OK')
  } catch (err) {
    if (err instanceof NotificationRejected) {
      logger.warn({ message: 'T-Bank notification rejected', reason: err.reason, orderId: (req.body as { OrderId?: string })?.OrderId, ip: req.ip })
      res.status(err.reason === 'bad_token' || err.reason === 'wrong_terminal' ? 403 : 404).type('text/plain').send(err.reason)
      return
    }
    throw err
  }
}))

export const billingRouter = Router()
billingRouter.use(authenticate)

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много попыток оплаты. Подождите несколько минут.', upgrade: false } },
})

billingRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await billingView(req.user.workspace_id))
}))

// POST /api/billing/checkout → { url } — the hosted payment form to redirect to.
billingRouter.post('/checkout', checkoutLimiter, asyncHandler(async (req, res) => {
  const saveCard = (req.body as Record<string, unknown> | null)?.save_card !== false
  res.json(await startCheckout(req.user.workspace_id, req.user.email, { saveCard }))
}))

// GET /api/billing/verify?order=… — the return page asks whether its order
// went through (the webhook can lag the redirect by seconds).
billingRouter.get('/verify', asyncHandler(async (req, res) => {
  const order = typeof req.query.order === 'string' ? req.query.order.trim() : ''
  if (!order || order.length > 50) throw new ValidationError('Не указан номер платежа')
  res.json(await verifyOrder(req.user.workspace_id, order))
}))

billingRouter.post('/cancel', asyncHandler(async (req, res) => {
  await setAutoRenewFor(req.user.workspace_id, req.user.id, false)
  res.json(await billingView(req.user.workspace_id))
}))

billingRouter.post('/resume', asyncHandler(async (req, res) => {
  await setAutoRenewFor(req.user.workspace_id, req.user.id, true)
  res.json(await billingView(req.user.workspace_id))
}))
