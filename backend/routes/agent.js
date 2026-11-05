const express = require('express')
const { Router } = express
const { rateLimit } = require('express-rate-limit')
const { generateAgentResponse, validLocale, safeImage } = require('../lib/llm')
const { ARC_CHAIN_ID, getTaskAuth } = require('../lib/taskAuth')
const { anonKeyFor, canChat, chargeMessage, config: feeConfig, feeState, normaliseAddress } = require('../lib/agentFees')
const { getCreditStore } = require('../lib/creditStore')

const router = Router()
router.use(getTaskAuth().taskSession)
const isAddress = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)

/**
 * Who pays for this message. A signed-in wallet is authoritative; otherwise the connected
 * wallet address sent by the app is trusted only for the free daily allowance.
 */
function billingFor(req, body) {
  const address = req.session?.address
  const verified = typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address) && req.session.chainId === ARC_CHAIN_ID ? address : null
  const settings = feeConfig()
  // A visitor with no wallet still gets the free daily allowance, counted per IP.
  const payer = verified || normaliseAddress(body?.address) || (settings.enabled ? anonKeyFor(req) : null)
  return { payer, allowCredits: Boolean(verified), settings, store: getCreditStore() }
}

/** Charge once the answer exists, so a failed reply never costs the user anything. */
function settleChat(payer, billing) {
  if (!payer) return undefined
  try {
    const receipt = chargeMessage(payer, billing)
    return receipt ? { charged: receipt.charged, kind: receipt.kind } : undefined
  } catch { return undefined }
}

/** 402 payload the app turns into the top-up card. */
function creditsRequired(res, payer) {
  return res.status(402).json({
    code: 'AGENT_CREDITS_REQUIRED',
    error: 'Your free Agent messages for today are used up. Add credits to keep going.',
    credits: feeState(payer),
  })
}
const perMinute = Number(process.env.AGENT_RATE_LIMIT_PER_MIN)

// Each chat can trigger several paid LLM calls; bound abuse per client.
// Behind a proxy, set TASK_TRUST_PROXY_HOPS so req.ip is the real client.
const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number.isSafeInteger(perMinute) && perMinute > 0 ? perMinute : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
  handler: (_req, res) => res.status(429).json({ error: 'Too many Agent requests. Please wait a minute.', code: 'AGENT_RATE_LIMITED' }),
})

// Chats with an attached image use their own content type so the app-wide 100 KB JSON parser
// skips them; only these two routes accept the larger body.
const CHAT_IMAGE_TYPE = 'application/vnd.makoto.chat+json'
const imageBody = express.json({ type: CHAT_IMAGE_TYPE, limit: '2mb' })

function parseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) return { error: 'Invalid chat request' }
  if (body.locale !== undefined && !validLocale(body.locale)) return { error: 'Invalid locale' }
  if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 12)) return { error: 'Invalid chat history' }
  if (body.address !== undefined && body.address !== null && !isAddress(body.address)) return { error: 'Invalid address' }
  if (body.memory !== undefined && (body.memory === null || typeof body.memory !== 'object' || Array.isArray(body.memory) || JSON.stringify(body.memory).length > 8000)) return { error: 'Invalid memory' }
  if (body.image !== undefined && body.image !== null && !safeImage(body.image)) return { error: 'Invalid image' }
  const mode = body.context && typeof body.context === 'object' ? body.context.mode : undefined
  return { value: { message: body.message.trim(), locale: body.locale || 'en', context: body.context, history: body.history, address: body.address || undefined, mode, memory: body.memory, image: body.image || undefined } }
}

const statusFor = (code) => code === 'LLM_NOT_CONFIGURED' ? 503 : code === 'LLM_RATE_LIMITED' ? 429 : code === 'LLM_TIMEOUT' ? 504 : 502

function replyPayload(result) {
  return {
    text: result.text,
    source: 'REAL_PROVIDER',
    ...(result.sources ? { sources: result.sources } : {}),
    ...(result.proposal ? { proposal: result.proposal } : {}),
    ...(result.plan ? { plan: result.plan } : {}),
    ...(result.task ? { task: result.task } : {}),
    ...(result.memory ? { memory: result.memory } : {}),
    ...(result.charts ? { charts: result.charts } : {}),
    ...(result.followups ? { followups: result.followups } : {}),
  }
}

/** Public, secret-free status for the Status page. */
router.get('/status', (_req, res) => {
  const configured = Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL && process.env.LLM_BASE_URL)
  res.set('Cache-Control', 'no-store').json({ status: configured ? 'ok' : 'unconfigured', streaming: true })
})

/** Latest daily Agent quality check (labels and pass/fail only; no wallet data). */
router.get('/eval', (_req, res) => {
  const { getAgentEval } = require('../lib/agentEval')
  res.set('Cache-Control', 'no-store').json(getAgentEval().latest())
})

router.post('/chat', chatLimiter, imageBody, async (req, res) => {
  const parsed = parseRequest(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const billing = billingFor(req, parsed.value)
  if (!canChat(billing.payer, billing)) return creditsRequired(res, billing.payer)
  let result
  try { result = await generateAgentResponse(parsed.value) }
  catch { return res.status(502).json({ error: 'Chat service failed before a provider response.', code: 'LLM_BACKEND_ERROR' }) }
  if (!result.ok) return res.status(statusFor(result.code)).json({ error: result.message, code: result.code })
  const charge = settleChat(billing.payer, billing)
  res.set('Cache-Control', 'no-store').json({ ...replyPayload(result), credits: feeState(billing.payer, billing.store, billing.settings), ...(charge ? { charged: charge } : {}) })
})

/**
 * Server-Sent Events variant. Events:
 *   status {tool, source}  — a read-only tool is being called
 *   delta  {text}          — streamed answer text
 *   done   {...payload}    — same body as POST /chat (authoritative final text)
 *   error  {code, error, status}
 */
router.post('/chat/stream', chatLimiter, imageBody, async (req, res) => {
  const parsed = parseRequest(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const billing = billingFor(req, parsed.value)
  if (!canChat(billing.payer, billing)) return creditsRequired(res, billing.payer)
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders?.()
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
  // Keep proxies from closing an idle connection while tools run.
  const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': keep-alive\n\n') }, 15_000)
  try {
    const result = await generateAgentResponse(parsed.value, {
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'delta') send('delta', { text: event.text })
        else if (event.type === 'status') send('status', { tool: event.tool, source: event.source })
      },
    })
    if (!result.ok) send('error', { error: result.message, code: result.code, status: statusFor(result.code) })
    else {
      const charge = settleChat(billing.payer, billing)
      send('done', { ...replyPayload(result), credits: feeState(billing.payer, billing.store, billing.settings), ...(charge ? { charged: charge } : {}) })
    }
  } catch {
    send('error', { error: 'Chat service failed before a provider response.', code: 'LLM_BACKEND_ERROR', status: 502 })
  } finally {
    clearInterval(keepAlive)
    res.end()
  }
})

module.exports = router
