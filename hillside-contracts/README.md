# hillside-contracts (EVM Escrow)

Hardhat workspace for multi-chain escrow and settlement contracts.

## Local Setup

```bash
cd hillside-contracts
npm install
cp .env.example .env
npm run build
```

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
