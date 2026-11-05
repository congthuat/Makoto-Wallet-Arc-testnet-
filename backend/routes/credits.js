/**
 * Agent credits API.
 *
 * GET  /api/credits        — balance, free messages left today, packs and the fee address.
 * POST /api/credits/verify — check a USDC top-up on Arc and add its credits.
 *
 * The posted transaction hash is only a pointer: the amount comes from the chain, and the
 * payer must be the wallet that signed in, so a hash belonging to someone else earns nothing.
 */
const { Router } = require('express')
const { rateLimit } = require('express-rate-limit')
const { ARC_CHAIN_ID, getTaskAuth } = require('../lib/taskAuth')
const { anonKeyFor, config, feeState, verifyTopUp } = require('../lib/agentFees')
const { getCreditStore } = require('../lib/creditStore')

const VERIFY_CODES = {
  INVALID_TX: [400, 'That transaction hash is not valid.'],
  AUTH_REQUIRED: [401, 'Verify your wallet first.'],
  BILLING_DISABLED: [503, 'Agent billing is turned off.'],
  PENDING: [409, 'The transaction is still confirming. Try again in a few seconds.'],
  FAILED: [422, 'That transaction failed on-chain, so nothing was charged.'],
  WRONG_SENDER: [403, 'That payment came from a different wallet.'],
  WRONG_RECIPIENT: [422, 'That transaction did not send USDC to the fee address.'],
  TOO_SMALL: [422, 'That payment is too small to convert into credits.'],
  ALREADY_CREDITED: [409, 'That transaction has already been added.'],
  RPC_UNAVAILABLE: [503, 'Arc is not answering right now. Try again shortly.'],
}

function sessionAddress(req) {
  const address = req.session?.address
  return typeof address === 'string' && /^0x[0-9a-f]{40}$/.test(address) && req.session.chainId === ARC_CHAIN_ID ? address : null
}

function createCreditsRouter(store = getCreditStore(), settings = config()) {
  const router = Router()
  const auth = getTaskAuth()
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { code: 'CREDITS_RATE_LIMITED', error: 'Too many top-up checks. Try again later.' },
  })
  router.use(auth.taskSession)
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

  // A visitor without a wallet still sees the free allowance they are actually using.
  router.get('/', (req, res) => res.json(feeState(sessionAddress(req) || anonKeyFor(req), store, settings)))

  router.post('/verify', limiter, auth.mutationOrigin, async (req, res) => {
    const payer = sessionAddress(req)
    if (!payer) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Verify your wallet first.' })
    const txHash = req.body?.txHash
    try {
      const result = await verifyTopUp({ txHash, payer, store, settings })
      if (result.ok) {
        return res.json({ ...result, ...feeState(payer, store, settings) })
      }
      const [status, message] = VERIFY_CODES[result.code] || [400, 'That top-up could not be verified.']
      return res.status(status).json({ code: result.code, error: message, ...(result.minimum ? { minimum: result.minimum } : {}) })
    } catch {
      return res.status(503).json({ code: 'CREDITS_UNAVAILABLE', error: 'Credits are unavailable right now.' })
    }
  })

  return router
}

module.exports = createCreditsRouter()

// Credits state is per wallet (or per IP before a wallet is connected).
