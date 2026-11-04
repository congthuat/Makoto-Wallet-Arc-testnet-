/**
 * Gift claim relayer ("trạm trả phí").
 *
 * People who open a Makoto gift link often have no USDC yet, and on Arc the network fee
 * is paid in USDC. The relayer submits `MakotoGifts.claim(id, recipient, signature)` and
 * pays that fee. It can never redirect a gift: the signature from the link key is bound
 * to the recipient, and the contract pays only that recipient.
 *
 * The relayer key is generated on first use and kept next to the other persistent data
 * (file mode 0600). It only ever holds a little testnet USDC for fees, and only ever
 * calls the official MakotoGifts contract.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ethers } = require('ethers')

const ARC_RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'
const ARC_CHAIN_ID = 5042002
/** CREATE2 address via the deterministic deployment proxy (salt keccak256("makoto.gifts.v1")). */
const GIFTS_ADDRESS = '0x330f86077F90f52Ad72BEeD924383403bC5874ED'
const GIFTS_ABI = [
  'function claim(uint256 id, address recipient, bytes signature) returns (uint256)',
  'function hasClaimed(uint256 id, address recipient) view returns (bool)',
]
/** Below this native balance (18 decimals) the relayer reports itself as low and stops. */
const MIN_BALANCE = ethers.parseEther('0.02')
const GAS_LIMIT_CAP = 400_000n

function persistentDir() {
  if (process.env.TASK_AUTH_DB_PATH) return path.dirname(process.env.TASK_AUTH_DB_PATH)
  if (process.env.TASK_DB_PATH) return path.dirname(process.env.TASK_DB_PATH)
  return path.join(__dirname, '..', 'data')
}

function loadOrCreateKey(file) {
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (/^0x[0-9a-fA-F]{64}$/.test(existing)) return existing
  } catch { /* first run */ }
  const wallet = ethers.Wallet.createRandom()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${wallet.privateKey}\n`, { mode: 0o600, flag: 'wx' })
  return wallet.privateKey
}

class GiftRelayer {
  constructor(options = {}) {
    this.keyFile = options.keyFile || process.env.GIFT_RELAYER_KEY_PATH || path.join(persistentDir(), 'gift-relayer.key')
    this.provider = options.provider || new ethers.JsonRpcProvider(ARC_RPC, ARC_CHAIN_ID, { staticNetwork: true })
    this.contractAddress = options.contractAddress || GIFTS_ADDRESS
    this.queue = Promise.resolve()
    this._wallet = null
  }

  wallet() {
    if (!this._wallet) {
      const key = process.env.GIFT_RELAYER_PRIVATE_KEY || loadOrCreateKey(this.keyFile)
      this._wallet = new ethers.Wallet(key, this.provider)
    }
    return this._wallet
  }

  async status() {
    const wallet = this.wallet()
    const [balance, code] = await Promise.all([this.provider.getBalance(wallet.address), this.provider.getCode(this.contractAddress)])
    return {
      enabled: true,
      address: wallet.address,
      contract: this.contractAddress,
      contractDeployed: typeof code === 'string' && code.length > 2,
      balance: ethers.formatEther(balance),
      low: balance < MIN_BALANCE,
    }
  }

  /** Validates, simulates, then submits one claim. Serialised so nonces never collide. */
  claim(input) {
    const run = this.queue.then(() => this._claim(input))
    this.queue = run.catch(() => {})
    return run
  }

  async _claim({ id, recipient, signature }) {
    if (typeof id !== 'string' || !/^\d{1,12}$/.test(id) || id === '0') throw httpError(400, 'Invalid gift id.')
    if (typeof recipient !== 'string' || !ethers.isAddress(recipient)) throw httpError(400, 'Invalid recipient.')
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw httpError(400, 'Invalid signature.')
    const wallet = this.wallet()
    const contract = new ethers.Contract(this.contractAddress, GIFTS_ABI, wallet)
    const to = ethers.getAddress(recipient)

    const balance = await this.provider.getBalance(wallet.address)
    if (balance < MIN_BALANCE) throw httpError(503, 'RELAYER_LOW', 'The fee helper is out of funds right now. Claim with your own wallet instead.')

    // Simulate first: a claim that would revert never costs the relayer a fee.
    let gas
    try {
      await contract.claim.staticCall(BigInt(id), to, signature)
      gas = await contract.claim.estimateGas(BigInt(id), to, signature)
    } catch (error) {
      throw httpError(409, revertCode(error), 'This gift cannot be claimed for this address.')
    }
    if (gas > GAS_LIMIT_CAP) throw httpError(409, 'GAS_TOO_HIGH', 'This claim needs an unusual amount of gas.')
    const fee = await this.provider.getFeeData()
    const tx = await contract.claim(BigInt(id), to, signature, {
      gasLimit: (gas * 13n) / 10n,
      ...(fee.maxFeePerGas ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n } : { gasPrice: fee.gasPrice }),
    })
    return { hash: tx.hash }
  }
}

const GIFT_ERRORS = ['GiftNotFound', 'GiftRefunded', 'GiftExpired', 'GiftEmpty', 'InvalidRecipient', 'CreatorCannotClaim', 'AlreadyClaimed', 'BadSignature', 'TransferFailed']
const giftInterface = new ethers.Interface(GIFT_ERRORS.map((name) => `error ${name}()`))
function revertCode(error) {
  const data = error?.data ?? error?.info?.error?.data ?? error?.error?.data
  if (typeof data === 'string' && data.length >= 10) {
    try { return giftInterface.parseError(data)?.name ?? 'CLAIM_REVERTED' } catch { /* unknown selector */ }
  }
  return 'CLAIM_REVERTED'
}

function httpError(status, code, message) {
  const error = new Error(message || code)
  error.status = status
  error.code = message ? code : undefined
  return error
}

let singleton
function getGiftRelayer() {
  if (!singleton) singleton = new GiftRelayer()
  return singleton
}

module.exports = { GiftRelayer, getGiftRelayer, GIFTS_ADDRESS, revertCode }
