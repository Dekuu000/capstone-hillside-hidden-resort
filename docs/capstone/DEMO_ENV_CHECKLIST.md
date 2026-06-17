# Hillside Hidden Resort — Demo Environment Checklist

Reference:
- [PROJECT_ALIGNMENT.md](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/PROJECT_ALIGNMENT.md)
- [ALIGNMENT_GAP_CHECKLIST.md](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/ALIGNMENT_GAP_CHECKLIST.md)

## 1) Demo Architecture Baseline (Must Match)

- Frontend: `hillside-next` (Next.js 15 PWA)
- Backend: `hillside-api` (FastAPI `/v2/*`)
- AI service: `hillside-ai` (optional but recommended for live AI demo)
- Database/Auth/Storage: Supabase Cloud
- Blockchain demo chain: **Ethereum Sepolia**
- Future cutover chain: Polygon/Amoy (not active for current demo)

---

## 2) Required Runtime Order

1. Start API
2. Start AI service (if demonstrating AI live mode)
3. Start Next.js app
4. Open app and validate health + auth + QR + sync status

Root commands:

```powershell
npm run dev:api
npm run dev:ai
npm run dev:next
```

---

## 3) `hillside-api/.env` Demo Profile (Sepolia-First)

## 3.1 Core App
- `APP_ENV=local`
- `APP_NAME=hillside-api`
- `API_VERSION=v2`
- `API_CORS_ALLOW_CREDENTIALS=true`
- `API_CORS_ALLOWED_ORIGINS` includes:
  - `http://localhost:3000`
  - `http://localhost:3001`
  - `http://127.0.0.1:3000`
  - `http://127.0.0.1:3001`

## 3.2 Supabase
- `SUPABASE_URL` set
- `SUPABASE_SERVICE_ROLE_KEY` set
- `API_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1`
- `API_JWT_AUDIENCE=authenticated`

## 3.3 Feature Flags (Demo Recommended)
- `FEATURE_ESCROW_SHADOW_WRITE=true`
- `FEATURE_ESCROW_ONCHAIN_LOCK=true`
- `FEATURE_NFT_GUEST_PASS=true`
- `FEATURE_DYNAMIC_QR=true`
- `FEATURE_ESCROW_RECONCILIATION_SCHEDULER=false` (keep off unless specifically demonstrating scheduler)
- `FEATURE_CHECKIN_WELCOME_NOTIFICATION=true`

## 3.4 QR Security
- `QR_SIGNING_PRIVATE_KEY` set
- `QR_SIGNING_SECRET` set (legacy fallback path)
- `QR_ROTATION_SECONDS=120` (local/dev safe interval)
- `QR_VERIFY_LEEWAY_SECONDS=5`

## 3.5 Chain (Current Demo Chain)
- `CHAIN_ACTIVE_KEY=sepolia`
- `CHAIN_ALLOWED_KEYS=sepolia,amoy`
- `CHAIN_ID_SEPOLIA=11155111`
- `EVM_RPC_URL_SEPOLIA` set
- `ESCROW_CONTRACT_ADDRESS_SEPOLIA` set
- `GUEST_PASS_CONTRACT_ADDRESS_SEPOLIA` set
- `ESCROW_SIGNER_PRIVATE_KEY_SEPOLIA` set
- `EXPLORER_BASE_URL_SEPOLIA=https://sepolia.etherscan.io/tx/`

## 3.6 AI
- `AI_SERVICE_BASE_URL=http://localhost:8100`
- `AI_INFERENCE_TIMEOUT_MS=2200`
- `AI_REQUIRE_PROPHET_FORECAST=false` (set `true` only if you need strict Prophet-only behavior)

---

## 4) `hillside-next/.env.local` Demo Profile

## 4.1 Core
- `NEXT_PUBLIC_SUPABASE_URL` set
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

## 4.2 Chain Display/UX
- `NEXT_PUBLIC_CHAIN_KEY=sepolia`
- `NEXT_PUBLIC_SUPPORTED_CHAIN_KEYS=sepolia,amoy`
- `NEXT_PUBLIC_CHAIN_ID=11155111`

## 4.3 Offline/Sync
- `NEXT_PUBLIC_SYNC_ENABLED=true`
- `NEXT_PUBLIC_SYNC_HARNESS_ENABLED=false`
- `NEXT_PUBLIC_SYNC_INTERVAL_MS=15000`
- `NEXT_PUBLIC_SYNC_MAX_RETRIES=8`
- `NEXT_PUBLIC_SYNC_PUSH_BATCH_SIZE=50`
- `NEXT_PUBLIC_SYNC_PULL_LIMIT=200`
- `NEXT_PUBLIC_ENABLE_SW_IN_DEV=true` (recommended for local offline demo checks)

---

## 5) Contracts Workspace (`hillside-contracts`)

Expected scripts available:
- `npm --prefix hillside-contracts run deploy:sepolia`
- `npm --prefix hillside-contracts run deploy:guestpass:sepolia`

Do not switch demo narrative to Polygon unless explicitly doing the cutover section.

---

## 6) Pre-Demo Verification Checklist (Must Pass)

## 6.1 API Health
- Open: `http://localhost:8000/health`
- Expect: status OK + no fatal startup errors

## 6.2 Chain Config API
- Open (authenticated admin flow in app): `/v2/chains`
- Expect:
  - active chain = `sepolia`
  - rpc configured = true
  - escrow contract configured = true
  - guest pass contract configured = true (if feature enabled)

## 6.3 Guest Login + Booking Status
- Login works
- `/my-bookings` loads
- Tabs/search/sync center render correctly

## 6.4 Payment Proof Flow
- Guest can submit payment proof
- Admin can verify
- Status transitions are correct

## 6.5 QR Flow
- `POST /v2/qr/issue` succeeds for eligible booking
- Admin scanner/check-in path validates token
- Replay/used token rejection behavior works

## 6.6 Offline Sync
- Guest or admin queue action while offline
- Reconnect and sync
- Sync Center shows queued → synced transition

## 6.7 Blockchain Auditability
- Booking/check-in/payment-linked blockchain references visible in admin ledger/audit views where expected
- No guest PII exposed in on-chain payloads or blockchain-linked fields

## 6.8 AI Endpoints
- AI recommendation endpoint responds
- Forecast/metrics endpoints respond
- App treats AI outputs as recommendations (not silent auto-overrides)

---

## 7) Defense-Safe Wording (Use Exactly)

Use this wording in reports/slides/demo script:

> The system currently uses Ethereum Sepolia for blockchain development and demonstration. Polygon L2 is retained as the future deployment target for lower-cost smart contract operations.

And:

> The blockchain layer stores only reservation hashes, transaction references, and audit proofs. Guest names, contact details, payment proof images, and personal information remain off-chain in Supabase.

---

## 8) Security Guardrails (Do Not Violate)

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Never store guest PII on-chain.
- Keep private keys only in backend/server-side environment.
- Do not disable QR signature verification for demo shortcuts.
- Do not remove offline sync queue behavior during UI polish.

---

## 9) If Something Fails Before Demo

1. Confirm ports:
   - Next: `3000` or `3001`
   - API: `8000`
   - AI: `8100`
2. Re-check `.env` and `.env.local` for chain/API URL mismatch.
3. Verify Supabase project URL + JWT issuer alignment.
4. Verify active chain remains `sepolia`.
5. Re-run:
   - `npm run typecheck`
   - `npm run test:guest:e2e` (if time permits before demo)

