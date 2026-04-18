# hillside-contracts (EVM Escrow)

Hardhat workspace for multi-chain escrow and settlement contracts.

## Local Setup

```bash
cd hillside-contracts
npm install
cp .env.example .env
npm run build
```

Notes:

1. Contract scripts now run through `scripts/run-hardhat.cjs`.
2. By default this routes Hardhat cache to `hillside-contracts/.cache/localappdata` (to avoid Windows `LOCALAPPDATA` permission issues).
3. To force global cache usage, set `HILLSIDE_HARDHAT_USE_GLOBAL_CACHE=1`.

Deploy to Amoy:

```bash
npm run deploy:amoy
```

Deploy to Sepolia:

```bash
npm run deploy:sepolia
```

Deploy guest pass NFT to Sepolia:

```bash
npm run deploy:guestpass:sepolia
```
