# Guide Compliance Gap Checklist

Last updated: 2026-02-23
Source of truth: instructor PDF guide + current repository state.

Status key:
- `Implemented`: in production path now
- `Partial`: scaffolded or demo-level; not fully guide-compliant
- `Missing`: not implemented yet

## 1) Technical Architecture & Stack

| Guide Requirement | Current State | Status | Evidence |
|---|---|---|---|
| Blockchain: Polygon (L2) + Solidity | Solidity escrow is implemented; dev runtime is Sepolia, Amoy retained for cutover target | Partial | `hillside-contracts/contracts/EscrowLedger.sol`, `hillside-api/app/core/config.py` |
| Frontend: Next.js 15 (PWA) | Next.js 15 guest/admin app is active migration target | Implemented | `hillside-next/package.json`, `hillside-next/app/*` |
| Backend: FastAPI | V2 domain API implemented | Implemented | `hillside-api/pyproject.toml`, `hillside-api/app/api/v2/*` |
| Cloud Storage: Supabase (Postgres) | Supabase auth/data/storage integrated | Implemented | `hillside-api/app/integrations/supabase_client.py`, `supabase/migrations/*` |
| AI Engine: Prophet / Scikit-learn | Live AI service exists, but model is heuristic (no Prophet/scikit runtime use) | Partial | `hillside-ai/app/main.py` |
| Web3 Bridge: Ethers.js | Ethers used in contracts workspace and anchor function; app-side wallet bridge not present | Partial | `hillside-contracts/package.json`, `supabase/functions/anchor-audit/index.ts` |

## 2) Core Functional Modules

### Module A: Blockchain Reservation Ledger

| Feature | Current State | Status |
|---|---|---|
| Smart Contract Escrow lock/release | Lock/release/refund flows implemented | Implemented |
| NFT Guest Pass | No ERC721 guest pass contract or mint flow | Missing |
| Immutable audit trail on-chain | DB audit logs + anchor flow exist, not full booking-lifecycle on-chain immutability | Partial |

### Module B: QR-based PWA Check-In

| Feature | Current State | Status |
|---|---|---|
| Offline check-in validation | Offline queue exists, but plain localStorage (not encrypted IndexedDB) | Partial |
| Dynamic QR rotation | Signed rotating tokens + anti-replay + offline sync | Implemented |
| Resort navigation maps | No interactive map module in current Next.js app | Missing |

### Module C: AI Hospitality Intelligence

| Feature | Current State | Status |
|---|---|---|
| Dynamic pricing | Endpoint implemented with non-blocking fallback | Implemented |
| Personalized concierge | No concierge recommendation module | Missing |
| Occupancy forecasting | No explicit forecasting endpoint persisted to DB | Missing |

### Module D: Resort Management Dashboard

| Feature | Current State | Status |
|---|---|---|
| Room inventory sync | Admin units + dashboard metrics implemented | Implemented |
| Ledger explorer | Escrow + audit views exist; full explorer UX not complete | Partial |
| Resource heatmap | Not implemented | Missing |

## 3) Interface Design Outline (Sitemap)

| Guide Screen Group | Current State | Status |
|---|---|---|
| Guest Portal (dashboard, reservation management, QR) | Implemented for core reservation/payment/QR flows | Implemented |
| Admin Dashboard (snapshot, room management, guest verification) | Implemented for core admin flows | Implemented |
| Blockchain Explorer (internal) | Escrow monitor and audit pages exist; no unified explorer page yet | Partial |

## 4) System Flow Guide

| Guide Phase | Current State | Status |
|---|---|---|
| Booking triggers on-chain lock | Implemented via escrow lock feature flag | Implemented |
| Dynamic QR issuance | Implemented | Implemented |
| Arrival offline QR availability | Implemented (queue path) | Partial |
| Validation with signature | Implemented | Implemented |
| Check-in releases room status + settlement flow | Reservation status flow implemented; escrow release now triggered at check-in in runtime | Implemented |
| Checkout settlement | Implemented in current escrow flow | Implemented |

## 5) Security & Data Privacy

| Guide Requirement | Current State | Status |
|---|---|---|
| ZKP hashes | Not implemented (deferred) | Missing |
| Wallet integration (MetaMask/custodial) | Custodial server-side signer exists; MetaMask path not implemented | Partial |
| Offline AES-256 IndexedDB | Not implemented yet (plain localStorage queue) | Missing |
| Keep PII off-chain | Enforced design principle in current architecture/docs | Implemented |

## Mandatory Closures for Current Phase

1. Maintain docs/runtime alignment for Sepolia dev + Polygon target wording.
2. Replace localStorage queue with AES-256 encrypted IndexedDB queue.
3. Add minimal ERC721 guest pass mint + verification API.
4. Add scikit/Prophet-ready AI forecasting endpoint and persist forecast results.
5. Keep ZKP explicitly documented as future work, not in scope for this phase.
