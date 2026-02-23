# Architecture (V2 Core)

## Container view

- **Next.js 15 (PWA shell)**: guest/admin web UI, auth cookies, SSR surfaces.
- **FastAPI**: canonical domain API (`/v2/auth`, `/v2/reservations`, `/v2/payments`, `/v2/qr`, `/v2/ai`).
- **Supabase (Postgres/Auth/Storage)**: source-of-truth during migration waves.
- **Ethereum Sepolia (active dev) / Polygon Amoy (target) contracts**: escrow lock/release and immutable booking settlement references.
- **AI service (placeholder)**: pricing and forecasting inference, non-blocking.

## Boundary rules

- On-chain: only non-PII references and payment/settlement state.
- Off-chain: reservation details, profiles, media, audit snapshots.
- Browser cache: encrypted offline queue and signed QR payloads only.

## Request path (target)

1. UI authenticates via Supabase.
2. UI calls FastAPI V2 with bearer token.
3. FastAPI validates token and applies domain policy.
4. FastAPI reads/writes Supabase and optionally emits chain writes.
5. Chain event refs are reconciled back to off-chain rows.
