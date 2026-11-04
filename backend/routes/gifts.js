const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { getGiftRelayer } = require('../lib/giftRelayer')

/**
 * /api/gifts — fee helper for Makoto gift ("lì xì") links.
 * GET  /relayer  → relayer address, balance and whether the gift contract is deployed.
 * POST /claim    → { id, recipient, signature } — submits the claim and pays the network fee.
 * The server never sees the link key; it only forwards a signature already bound to the recipient.
 */
function createGiftsRouter(deps = {}) {
  const router = express.Router()
  const relayer = () => deps.relayer ?? getGiftRelayer()
  router.use(express.json({ limit: '4kb' }))

  router.get('/relayer', async (_req, res) => {
    try { res.json(await relayer().status()) }
    catch { res.json({ enabled: false }) }
  })

  router.post('/claim', rateLimit({ windowMs: 10 * 60_000, limit: deps.claimLimit ?? 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many claims from this connection. Try again later.', code: 'RATE_LIMITED' } }), async (req, res) => {
    try {
      const { id, recipient, signature } = req.body ?? {}
      res.json(await relayer().claim({ id: String(id ?? ''), recipient, signature }))
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502
      res.status(status).json({ error: status === 502 ? 'Could not reach Arc right now. Try again.' : error.message, code: error?.code ?? (status === 502 ? 'RPC_UNAVAILABLE' : undefined) })
    }
  })

  return router
}

module.exports = createGiftsRouter()
module.exports.createGiftsRouter = createGiftsRouter
