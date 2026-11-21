// Arc Testnet → destination routes with Circle forwarding, keyed by CCTP domain.
// Mirrors frontend/src/migrated/cctp.ts CCTP_DESTINATIONS (values from Circle's official kit).
const DESTINATIONS = Object.freeze({
  6: { name: 'Base Sepolia', chainId: 84532, rpc: 'https://sepolia.base.org', usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e' },
  0: { name: 'Ethereum Sepolia', chainId: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com', usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' },
  3: { name: 'Arbitrum Sepolia', chainId: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc', usdc: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d' },
  2: { name: 'OP Sepolia', chainId: 11155420, rpc: 'https://sepolia.optimism.io', usdc: '0x5fd84259d66cd46123540766be93dfe6d43130d7' },
  1: { name: 'Avalanche Fuji', chainId: 43113, rpc: 'https://api.avax-test.network/ext/bc/C/rpc', usdc: '0x5425890298aed601595a70ab815c96711a31bc65' },
  7: { name: 'Polygon Amoy', chainId: 80002, rpc: 'https://polygon-amoy-bor-rpc.publicnode.com', usdc: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582' },
  10: { name: 'Unichain Sepolia', chainId: 1301, rpc: 'https://sepolia.unichain.org', usdc: '0x31d0220469e10c4e71834a79b1f276d740d3768f' },
  11: { name: 'Linea Sepolia', chainId: 59141, rpc: 'https://rpc.sepolia.linea.build', usdc: '0xfece4462d57bd51a6a552365a011b95f0e16d9b7' },
  14: { name: 'World Chain Sepolia', chainId: 4801, rpc: 'https://worldchain-sepolia.g.alchemy.com/public', usdc: '0x66145f38cbac35ca6f1dfb4914df98f1614aea88' },
  13: { name: 'Sonic Testnet', chainId: 14601, rpc: 'https://rpc.testnet.soniclabs.com', usdc: '0x0ba304580ee7c9a980cf72e55f5ed2e9fd30bc51' },
  16: { name: 'Sei Testnet', chainId: 1328, rpc: 'https://evm-rpc-testnet.sei-apis.com', usdc: '0x4fcf1784b31630811181f670aea7a7bef803eaed' },
  19: { name: 'HyperEVM Testnet', chainId: 998, rpc: 'https://rpc.hyperliquid-testnet.xyz/evm', usdc: '0x2b3370ee501b4a559b57d449569354196457d8ab' },
  21: { name: 'Ink Sepolia', chainId: 763373, rpc: 'https://rpc-gel-sepolia.inkonchain.com', usdc: '0xfabab97dce620294d2b0b0e46c68964e326300ac' },
  22: { name: 'Plume Testnet', chainId: 98867, rpc: 'https://testnet-rpc.plume.org', usdc: '0xcb5f30e335672893c7eb944b374c196392c19d18' },
  15: { name: 'Monad Testnet', chainId: 10143, rpc: 'https://testnet-rpc.monad.xyz', usdc: '0x534b2f3a21130d7a60830c2df862319e593943a3' },
  28: { name: 'Edge Testnet', chainId: 33431, rpc: 'https://edge-testnet.g.alchemy.com/public', usdc: '0x2d9f7cad728051aa35ecdc472a14cf8cdf5cfd6b' },
  18: { name: 'XDC Apothem', chainId: 51, rpc: 'https://erpc.apothem.network', usdc: '0xb5ab69f7bbada22b28e79c8ffaece55ef1c771d4' },
  12: { name: 'Codex Testnet', chainId: 812242, rpc: 'https://rpc.codex-stg.xyz', usdc: '0x6d7f141b6819c2c9cc2f818e6ad549e7ca090f8f' },
})

const SHORT = { 'Base Sepolia': 'Base', 'Ethereum Sepolia': 'Ethereum', 'Arbitrum Sepolia': 'Arbitrum', 'OP Sepolia': 'Optimism', 'Avalanche Fuji': 'Avalanche', 'Polygon Amoy': 'Polygon', 'Unichain Sepolia': 'Unichain', 'Linea Sepolia': 'Linea', 'World Chain Sepolia': 'World Chain', 'Sonic Testnet': 'Sonic', 'Sei Testnet': 'Sei', 'HyperEVM Testnet': 'HyperEVM', 'Ink Sepolia': 'Ink', 'Plume Testnet': 'Plume', 'Monad Testnet': 'Monad', 'Edge Testnet': 'Edge', 'XDC Apothem': 'XDC', 'Codex Testnet': 'Codex' }
const DESTINATION_NAMES = Object.freeze(Object.values(DESTINATIONS).map((d) => d.name))

/** Normalise a model-supplied chain name ("arbitrum", "OP Sepolia", "Base") to a supported destination name. */
function destinationName(value) {
  if (typeof value !== 'string') return undefined
  const n = value.trim().toLowerCase().replace(/\s+(?:sepolia|testnet|fuji|amoy|apothem)$/, '')
  if (!n) return undefined
  const aliases = { eth: 'Ethereum Sepolia', ethereum: 'Ethereum Sepolia', arb: 'Arbitrum Sepolia', op: 'OP Sepolia', optimism: 'OP Sepolia', avax: 'Avalanche Fuji', matic: 'Polygon Amoy', pol: 'Polygon Amoy', worldchain: 'World Chain Sepolia', hyperliquid: 'HyperEVM Testnet', hype: 'HyperEVM Testnet' }
  if (aliases[n]) return aliases[n]
  return DESTINATION_NAMES.find((name) => name.toLowerCase() === value.trim().toLowerCase() || name.toLowerCase().startsWith(`${n} `) || SHORT[name].toLowerCase() === n)
}

module.exports = { DESTINATIONS, DESTINATION_NAMES, destinationName }
