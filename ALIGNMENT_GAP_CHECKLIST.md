# Hillside Hidden Resort — Alignment Gap Checklist

Reference: [PROJECT_ALIGNMENT.md](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/PROJECT_ALIGNMENT.md)

## Status Legend
- `PASS`: Implemented and aligned
- `PARTIAL`: Exists but needs hardening/completion
- `GAP`: Missing or not clearly implemented
- `VERIFY`: Implemented but needs explicit validation/demo test

---

## 1) Architecture Baseline

### 1.1 Monorepo Structure
- Status: `PASS`
- Evidence:
  - `hillside-next/` (frontend PWA)
  - `hillside-api/` (FastAPI)
  - `hillside-contracts/` (Solidity/Hardhat)
  - `supabase/` (migrations/functions)

### 1.2 Sepolia-First Direction
- Status: `PASS`
- Evidence:
  - [hillside-api/.env.example](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/hillside-api/.env.example) uses `CHAIN_ACTIVE_KEY=sepolia`
  - [hillside-api/app/core/config.py](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/hillside-api/app/core/config.py) defaults to Sepolia
- Action:
  - Keep Polygon/Amoy as future cutover target only.

### 1.3 Documentation Consistency (Sepolia wording)
- Status: `PARTIAL`
- Risk:
  - Some docs still imply Polygon/Amoy as primary runtime target.
- Action:
  - Normalize docs: “Sepolia now, Polygon later.”

---

## 2) Guest PWA (MVP)

### 2.1 Required Guest Routes
- Status: `PASS`
- Evidence:
  - `/book`, `/tours`, `/my-bookings`, `/guest/my-stay`, `/guest/map`, `/guest/services`, `/guest/profile`, `/guest/sync`, `/login`

### 2.2 Mobile-First UX + Responsive
- Status: `PARTIAL`
- Notes:
  - Major progress made; still requires continuous QA on 320/375/390/430 widths and desktop scaling.
- Action:
  - Keep regression checks for tabs, bottom nav, safe-area spacing, hero card density.

### 2.3 Booking Flow + Payment Proof Upload
- Status: `PASS`
- Evidence:
  - My Bookings supports payment proof submission.
  - API routes exist for reservation and payment submission.

### 2.4 QR Status in Guest Experience
- Status: `PASS`
- Evidence:
  - My Bookings has QR issue/display flow and status handling.

---

## 3) Admin Dashboard (MVP)

### 3.1 Reservation + Payment Verification
- Status: `PASS`
- Evidence:
  - Admin routes and clients exist for reservations and payments.

### 3.2 QR Verification / Check-In Console
- Status: `PASS`
- Evidence:
  - Admin check-in UI and `/v2/qr/verify`, `/v2/checkins`, `/v2/checkouts`.

### 3.3 Units/Inventory + Operations
- Status: `PASS`
- Evidence:
  - Admin units + dashboard/report routes present.

### 3.4 Guest Management as Distinct Module
- Status: `PARTIAL`
- Risk:
  - Guest profile exists, but full dedicated admin “guest management” module is not clearly isolated in UX scope.

---

## 4) QR Security + Offline

### 4.1 Signed Dynamic QR
- Status: `PARTIAL`
- Evidence:
  - Implemented in API, but feature-flag gated.
- Risk:
  - Could be disabled/misconfigured in demo if env not set.

### 4.2 Anti-Replay / Expiry Validation
- Status: `PASS`
- Evidence:
  - QR verification checks signature, expiry, consumed/revoked state.

### 4.3 Offline QR Display + Queue
- Status: `PASS`
- Evidence:
  - Guest QR cache and admin offline queue/sync paths present.

### 4.4 QR Payload Privacy
- Status: `VERIFY`
- Action:
  - Run payload inspection test to confirm no PII fields are exposed in token/payload.

---

## 5) Blockchain Layer

### 5.1 Sepolia Demo Integration
- Status: `PARTIAL`
- Evidence:
  - Contracts workspace supports Sepolia deploy.
  - API has chain/escrow/nft integrations and reconciliation.
- Risk:
  - Demo completeness depends on env keys, contract addresses, flags.

### 5.2 Immutable Audit / Ledger Explorer UX
- Status: `PARTIAL`
- Evidence:
  - Admin blockchain/audit pages exist.
- Action:
  - Validate end-to-end event-to-tx visibility during demo script.

### 5.3 Keep Guest PII Off-Chain
- Status: `PASS`
- Evidence:
  - Current design references hash/token/tx flows; no direct requirement to store PII on-chain.
- Action:
  - Maintain strict rule in future changes.

### 5.4 Escrow + NFT Scope
- Status: `PARTIAL`
- Note:
  - Present but should remain MVP-safe (demo-level if required), not overbuilt prematurely.

---

## 6) AI Module

### 6.1 Occupancy Forecast + Pricing Recommendation
- Status: `PARTIAL`
- Evidence:
  - AI endpoints and persistence tables exist.
- Risk:
  - Runtime behavior depends on AI service availability/config and fallback mode.

### 6.2 Admin-Approved AI Decisions
- Status: `VERIFY`
- Action:
  - Confirm UI flow always treats AI as recommendation (not automatic override).

---

## 7) Supabase + Backend Security

### 7.1 Supabase as Off-Chain Source of Truth
- Status: `PASS`

### 7.2 Service Role Isolation
- Status: `PASS`
- Rule:
  - Never expose service role in frontend.

### 7.3 FastAPI as Trusted Layer
- Status: `PASS`
- Evidence:
  - Core privileged operations routed through FastAPI.

---

## 8) Offline-First and Sync

### 8.1 Sync Engine + Queue + Conflicts
- Status: `PASS`
- Evidence:
  - Sync engine provider, sync center, outbox/conflict flows exist.

### 8.2 Offline UI State Clarity
- Status: `PARTIAL`
- Action:
  - Continue UX polishing for queue status clarity in both guest and admin.

---

## 9) Demo Readiness Risks

### 9.1 Environment Drift
- Status: `RISK`
- Mitigation:
  - Freeze one canonical demo `.env` profile for Next/API/AI/contracts.

### 9.2 Feature Flag Drift
- Status: `RISK`
- Mitigation:
  - Pre-demo script/checklist must verify QR/chain/AI flags.

### 9.3 Chain Config Drift
- Status: `RISK`
- Mitigation:
  - Verify Sepolia RPC, chain IDs, contract addresses, and signer keys before demo.

---

## 10) Recommended Next Steps (No Contract/API Breaking Changes)

1. Create `DEMO_ENV_CHECKLIST.md` with exact required env values and feature flags for demo mode.
2. Add a “pre-demo health check” script:
   - API health
   - chain config endpoint
   - QR public key availability
   - AI service reachability
   - sync engine status
3. Run focused e2e smoke scenarios:
   - guest booking + payment proof
   - admin payment verify
   - QR issue + verify + check-in
   - offline queue + sync recovery
4. Standardize docs wording:
   - Sepolia active now; Polygon future cutover.
5. Keep NFT/ZKP/full escrow automation as non-blocking unless defense panel explicitly requires full production behavior.

