# MakotoPayRequests

**Arc Testnet deployment:** [`0x190132A7C8D218845c2769471C625E6da5eE4dFE`](https://testnet.arcscan.app/address/0x190132A7C8D218845c2769471C625E6da5eE4dFE) (constructor: USDC `0x3600…0000`, EURC `0x89B5…D72a`). Source verified on ArcScan ([view code](https://testnet.arcscan.app/address/0x190132A7C8D218845c2769471C625E6da5eE4dFE?tab=contract)): solc 0.8.24, optimizer 200 runs, EVM `paris`, `bytecodeHash: none`. Creation bytecode matches this source byte for byte.

Payment requests and bill splitting on Arc Testnet.

- **Non-custodial:** each payment goes straight from payer to payee (`transferFrom(payer → payee)`); the contract never holds tokens.
- **No owner, no admin, no upgrade, no fees.** Only USDC and EURC (fixed at deployment) are accepted.
- **Invoice** (`maxPayments = 1`, optionally only one `allowedPayer`) or **split bill** (`maxPayments = N`, each address pays one share once).
- Payee can `cancel`; optional expiry; memo ≤ 140 bytes.

```sh
forge install foundry-rs/forge-std --no-git   # once
forge test                                     # 11 tests incl. fuzzing
forge build && node scripts/export-artifact.mjs  # refresh frontend/src/contracts/makotoPayRequests.ts
```

Note: Arc's native USDC calls an Arc-only precompile (blocklist check), so a local fork
cannot simulate USDC transfers; the EURC path was verified on an Arc Testnet fork.
Deployment is done from the owner's wallet in the app (Payment requests → Deploy contract).

# MakotoGifts (gift links / "lì xì")

`src/MakotoGifts.sol` — fund a gift once, share a link, each person claims one share.

- Fixed address on Arc Testnet: `0x330f86077F90f52Ad72BEeD924383403bC5874ED`, deployed through the
  deterministic-deployment proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C` with salt
  `keccak256("makoto.gifts.v1")` and constructor args `(USDC, EURC)`. Anyone can deploy it once from the
  Gift links page ("Activate"); the result is always the same address.
- Only USDC and EURC. No owner, no admin, no upgrades, no fees. Max 50 shares, 30 days, 140-byte message.
- The link (`#gift-<id>-<key>`) carries a one-time key in the URL hash; the contract stores only its
  address. A claim is `claim(id, recipient, sig)` where `sig` is the link key's personal_sign over
  `claimHash(id, recipient)`, so whoever submits it (the Makoto fee helper or the recipient) cannot
  redirect funds. One claim per address; the creator cannot claim; the creator can refund the rest any time.
- Fee helper: `backend/routes/gifts.js` + `backend/lib/giftRelayer.js` pay the claim fee from a server key
  (`GIFT_RELAYER_PRIVATE_KEY`, or a key file created on first use next to the task database). Fund its
  address (shown on the page) with a little test USDC.

```
forge test --match-contract MakotoGifts
node scripts/export-gifts-artifact.mjs   # refresh frontend/src/contracts/makotoGifts.ts
```
