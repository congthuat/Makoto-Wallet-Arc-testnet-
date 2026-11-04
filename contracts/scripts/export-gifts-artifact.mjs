// Copies the compiled MakotoGifts ABI and bytecode into the frontend (run after `forge build`).
import fs from 'node:fs'
const art = JSON.parse(fs.readFileSync(new URL('../out/MakotoGifts.sol/MakotoGifts.json', import.meta.url)))
const header = '/* Generated from contracts/src/MakotoGifts.sol (solc 0.8.24, evm paris, optimizer 200, bytecode_hash none).\n * Regenerate: cd contracts && forge build && node scripts/export-gifts-artifact.mjs */\n'
const body = `export const MAKOTO_GIFTS_ABI = ${JSON.stringify(art.abi, null, 2)} as const\n\nexport const MAKOTO_GIFTS_BYTECODE = '${art.bytecode.object}' as const\n`
fs.writeFileSync(new URL('../../frontend/src/contracts/makotoGifts.ts', import.meta.url), header + body)
console.log('exported', art.abi.length, 'ABI entries')
