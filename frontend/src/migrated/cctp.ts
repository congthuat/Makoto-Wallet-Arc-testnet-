import { getAddress, pad, type Address, type Hex } from "viem";

export const ARC_CCTP_DOMAIN = 26;
export const BASE_SEPOLIA_CCTP_DOMAIN = 6;
export const CCTP_STANDARD_FINALITY = 2000;
export const CCTP_TOKEN_MESSENGER_V2 = getAddress("0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA");
export const CCTP_MESSAGE_TRANSMITTER_V2 = getAddress("0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275");
export const CCTP_KIT_BRIDGE_TESTNET = getAddress("0xC5567a5E3370d4DBfB0540025078e283e36A363d");
export const BASE_SEPOLIA_USDC = getAddress("0x036CbD53842c5426634e7929541ec2318f3dCF7e");
export const CCTP_TOKEN_MINTER_V2 = getAddress("0xb43db544E2c27092c107639Ad201b3dEfAbcF192");
export const CCTP_FORWARDING_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000" as Hex;
export const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";

/**
 * Arc Testnet → destination routes Circle's official CCTP v2 kit supports with
 * forwarding (Circle mints on the destination, so no destination gas is needed).
 * Every entry is re-checked against the kit's own chain metadata before use.
 */
export type CctpDestination = Readonly<{ chainId: number; name: string; short: string; domain: number; usdc: Address; explorer: string; aliases: readonly string[] }>;
const dest = (chainId: number, name: string, short: string, domain: number, usdc: string, explorer: string, aliases: string[]): CctpDestination =>
  Object.freeze({ chainId, name, short, domain, usdc: getAddress(usdc), explorer, aliases: Object.freeze(aliases) });
export const CCTP_DESTINATIONS: readonly CctpDestination[] = Object.freeze([
  dest(84532, "Base Sepolia", "Base", 6, "0x036CbD53842c5426634e7929541ec2318f3dCF7e", "https://sepolia.basescan.org", ["base"]),
  dest(11155111, "Ethereum Sepolia", "Ethereum", 0, "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", "https://sepolia.etherscan.io", ["ethereum", "eth", "eth sepolia"]),
  dest(421614, "Arbitrum Sepolia", "Arbitrum", 3, "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", "https://sepolia.arbiscan.io", ["arbitrum", "arb"]),
  dest(11155420, "OP Sepolia", "Optimism", 2, "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", "https://sepolia-optimistic.etherscan.io", ["optimism", "op sepolia", "op"]),
  dest(43113, "Avalanche Fuji", "Avalanche", 1, "0x5425890298aed601595a70ab815c96711a31bc65", "https://subnets-test.avax.network/c-chain", ["avalanche", "avax", "fuji"]),
  dest(80002, "Polygon Amoy", "Polygon", 7, "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582", "https://amoy.polygonscan.com", ["polygon", "matic", "amoy", "pol"]),
  dest(1301, "Unichain Sepolia", "Unichain", 10, "0x31d0220469e10c4E71834a79b1f276d740d3768F", "https://unichain-sepolia.blockscout.com", ["unichain"]),
  dest(59141, "Linea Sepolia", "Linea", 11, "0xfece4462d57bd51a6a552365a011b95f0e16d9b7", "https://sepolia.lineascan.build", ["linea"]),
  dest(4801, "World Chain Sepolia", "World Chain", 14, "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88", "https://sepolia.worldscan.org", ["world chain", "worldchain"]),
  dest(14601, "Sonic Testnet", "Sonic", 13, "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51", "https://testnet.sonicscan.org", ["sonic"]),
  dest(1328, "Sei Testnet", "Sei", 16, "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", "https://testnet.seiscan.io", ["sei"]),
  dest(998, "HyperEVM Testnet", "HyperEVM", 19, "0x2B3370eE501B4a559b57D449569354196457D8Ab", "https://app.hyperliquid-testnet.xyz/explorer", ["hyperevm", "hyperliquid", "hype"]),
  dest(763373, "Ink Sepolia", "Ink", 21, "0xFabab97dCE620294D2B0b0e46C68964e326300Ac", "https://explorer-sepolia.inkonchain.com", ["ink"]),
  dest(98867, "Plume Testnet", "Plume", 22, "0xcB5f30e335672893c7eb944B374c196392C19D18", "https://testnet-explorer.plume.org", ["plume"]),
  dest(10143, "Monad Testnet", "Monad", 15, "0x534b2f3A21130d7a60830c2Df862319e593943A3", "https://testnet.monadscan.com", ["monad"]),
  dest(33431, "Edge Testnet", "Edge", 28, "0x2d9F7CAD728051AA35Ecdc472a14cf8cDF5CFD6B", "https://edge-testnet.explorer.alchemy.com", ["edge"]),
  dest(51, "XDC Apothem", "XDC", 18, "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4", "https://testnet.xdcscan.com", ["xdc", "apothem"]),
  dest(812242, "Codex Testnet", "Codex", 12, "0x6d7f141b6819C2c9CC2f818e6ad549E7Ca090F8f", "https://explorer.codex-stg.xyz", ["codex"]),
]);
export const DEFAULT_CCTP_DESTINATION = CCTP_DESTINATIONS[0];
export const cctpDestinationByChainId = (chainId: number | undefined) => CCTP_DESTINATIONS.find((d) => d.chainId === chainId);
export const cctpDestinationByDomain = (domain: number | undefined) => CCTP_DESTINATIONS.find((d) => d.domain === domain);
export const cctpDestinationByName = (name: string | undefined) => {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return undefined;
  return CCTP_DESTINATIONS.find((d) => d.name.toLowerCase() === n || d.short.toLowerCase() === n || d.aliases.includes(n));
};
/** First destination mentioned in free text (longest alias wins so "op sepolia" beats "op"). */
export function cctpDestinationFromText(text: string): CctpDestination | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9à-ỹ ]+/g, " ")} `;
  let best: { d: CctpDestination; len: number } | undefined;
  for (const d of CCTP_DESTINATIONS) {
    for (const a of [d.name.toLowerCase(), d.short.toLowerCase(), ...d.aliases]) {
      if (a.length >= 2 && t.includes(` ${a} `) && (!best || a.length > best.len)) best = { d, len: a.length };
    }
  }
  return best?.d;
}
export const cctpExplorerTx = (d: CctpDestination, hash: string) => `${d.explorer}/tx/${hash}`;

export type CctpForwardingFee = {
  finalityThreshold: typeof CCTP_STANDARD_FINALITY;
  minimumFee: number;
  forwardFeeMed: string;
  quotedAt: number;
};

export type CctpTransferAmounts = {
  transferAmount: bigint;
  protocolFee: bigint;
  forwardingFee: bigint;
  maxFee: bigint;
  totalAmount: bigint;
};

export const CCTP_TOKEN_MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export function addressToBytes32(address: Address) {
  return pad(getAddress(address), { size: 32 });
}

export function calculateCctpForwardingAmounts(transferAmount: bigint, fee: CctpForwardingFee): CctpTransferAmounts {
  if (transferAmount <= 0n) throw new Error("Transfer amount must be positive");
  if (fee.finalityThreshold !== CCTP_STANDARD_FINALITY) throw new Error("Only standard finality is supported");
  if (!Number.isFinite(fee.minimumFee) || fee.minimumFee < 0) throw new Error("Invalid CCTP protocol fee");
  if (!/^\d+$/.test(fee.forwardFeeMed)) throw new Error("Invalid forwarding fee");

  const feeBpsHundredths = BigInt(Math.round(fee.minimumFee * 100));
  const protocolFee = (transferAmount * feeBpsHundredths) / 1_000_000n;
  const forwardingFee = BigInt(fee.forwardFeeMed);
  const maxFee = protocolFee + forwardingFee;

  return {
    transferAmount,
    protocolFee,
    forwardingFee,
    maxFee,
    totalAmount: transferAmount + maxFee,
  };
}
