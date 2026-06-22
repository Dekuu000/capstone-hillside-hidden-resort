# Hillside Hidden Resort PWA

Mobile-first resort reservation and guest check-in system for **Hillside Hidden Resort**.

This repository contains the current capstone implementation of a Web3-hybrid Progressive Web App (PWA) that combines:

- guest booking and tour reservations
- payment proof submission and admin payment verification
- QR-based check-in
- role-based back office (Front Desk / Manager / System Admin) with staff account management
- promotions & discount codes (guest-entered + auto-applied seasonal sales)
- guest reviews & ratings with admin moderation
- in-app notifications for booking updates and back-office events
- automated booking lifecycle (auto-release of unpaid holds, no-show handling)
- admin reservation, unit, service, report, and payment dashboards
- offline-friendly guest and admin flows
- AI-assisted resort insights
- Sepolia-based blockchain auditability

## Current Project Status

The active web application is:

```txt
hillside-next/
```

The previous Vite/React application is retained only as legacy reference:

```txt
hillside-app/
```

It is **not part of the active workspace build** and is not used by the current Netlify production config. A manual legacy workflow still exists for archival deployment only when explicitly triggered. The folder can be removed later in a dedicated cleanup commit after confirming no historical comparison or adviser review needs it.

## System Architecture

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend PWA | Next.js 15, React 19, TypeScript, Tailwind 4 | Guest portal, booking flow, admin dashboard, QR UI, offline-friendly UI |
| Backend API | FastAPI | Trusted business logic, reservations, QR validation, payments, blockchain bridge |
| Database/Auth/Storage | Supabase | Off-chain source of truth for users/roles, reservations, payments, QR metadata, media, audit logs, notifications, reviews, and promotions |
| AI Service | Prophet / scikit-learn with fallback behavior | Forecasting, pricing recommendations, concierge suggestions |
| Blockchain | Ethereum Sepolia now, Polygon L2 later | Immutable hashes, transaction references, audit proofs, escrow concept |
| Smart Contracts | Solidity / Hardhat | Demo escrow and guest-pass contracts |
| Shared Contracts | `packages/shared` | Shared TypeScript schemas and types |

## Important Blockchain Note

The system currently uses **Ethereum Sepolia** for development and demonstration.

Polygon L2 / Polygon Amoy is retained as the future deployment target for lower-cost smart contract operations.

Guest personal information is kept off-chain. The blockchain layer is used only for privacy-safe proofs such as hashes, transaction references, and audit records.

## Repository Structure

```txt
.
|-- hillside-next/          Active Next.js PWA
|-- hillside-api/           FastAPI backend
|-- hillside-ai/            AI forecasting/recommendation service
|-- hillside-contracts/     Solidity/Hardhat smart contracts
|-- packages/shared/        Shared TypeScript schemas
|-- supabase/               Database migrations and SQL utilities
|-- docs/                   Architecture, rollout, evidence, and capstone support docs
|-- design-system/          Design notes and UI references
|-- scripts/                Dev orchestration / helper scripts
|-- hillside-app/           Legacy Vite app retained for reference only
|-- netlify.toml            Netlify deployment config for hillside-next
`-- render.yaml             Render deployment config for hillside-api
```

## Main Features

### Roles & Access

The system has four role tiers (ascending privilege). Back-office labels are guest-friendly:

| Role (DB) | Back-office label | Can do |
| --- | --- | --- |
| `guest` | — | Book stays/tours, pay, review own trips |
| `staff` | **Front Desk** | Operations: check-in/out, walk-ins, payments, service queue |
| `admin` | **Manager** | Front Desk + units, reservations, reports, promotions |
| `super_admin` | **System Admin** | Everything + team/staff account management, smart pricing, records & security |

Higher roles inherit lower-role access. Tiers are enforced both server-side (`require_admin` / `require_operations` / role checks on the API) and in the UI (route gating + role-aware navigation). Account creation/role changes are done from the **Team** page (System Admin / Manager).

### Guest PWA

- account registration and login
- book a stay
- reserve tours
- apply promotion / discount codes at checkout
- upload payment proof
- view booking status
- see QR readiness
- open check-in QR when eligible
- leave reviews and ratings on completed stays
- receive in-app notifications (booking updates, reminders)
- browse resort map and services
- use mobile bottom navigation
- use offline-friendly Sync Center behavior

### Admin Dashboard

- resort operations overview
- reservations console
- walk-in stay and tour flow
- payment verification and recording
- QR check-in console
- unit inventory management
- service request queue
- reports and analytics (including promo discount totals)
- promotions & discount-code management (percentage / fixed, auto-apply seasonal)
- team / staff account management (role-based, System Admin / Manager)
- guest review moderation (hide / show)
- in-app notifications for back-office events (no-shows, etc.)
- blockchain/audit reference pages
- AI forecasting and recommendation views

### QR Check-In

- signed QR token concept
- QR verification through FastAPI
- check-in date/time validation
- remaining-balance visibility
- check-in override flow for approved admin cases
- offline pack and queue support where available

### Payment Flow

The current MVP payment mode is **proof-based payment verification**:

1. Guest submits booking.
2. Guest pays the required minimum deposit through the supported manual payment method.
3. Guest uploads payment proof.
4. Admin verifies payment.
5. Reservation becomes eligible for QR/check-in rules.

**Deposit policy:** the required deposit is **20% of the total**, clamped to a **₱500 floor** and a **₱5,000 cap**. Promo discounts are applied to the total before the deposit is computed.

**Automated booking lifecycle** (background schedulers, feature-flagged):

- **Auto-release:** unpaid `pending_payment` holds are released automatically ~2 hours after booking, freeing the held unit/slot. The guest is notified; the booking is marked cancelled with outcome `released`.
- **Auto no-show:** confirmed bookings whose check-out date has passed without a check-in are flagged `no_show` (deposit forfeited) after a short grace period; staff can also mark a no-show manually.

Real-money blockchain escrow is not treated as production payment custody in this MVP.

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Python 3.11+
- Supabase project credentials
- Render/Netlify environment values for deployment

### Install JavaScript Dependencies

```bash
npm install
```

### Run the Next.js PWA

```bash
npm run dev:next
```

Default local URL:

```txt
http://localhost:3000
```

### Run the FastAPI Backend

```bash
npm run dev:api
```

Default local API URL:

```txt
http://localhost:8000
```

### Run the AI Service

```bash
npm run dev:ai
```

Default local AI URL:

```txt
http://localhost:8100
```

## Environment Variables

Do not commit `.env` files or private keys.

### Frontend (`hillside-next`)

Common required values:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_CHAIN_KEY=sepolia
NEXT_PUBLIC_SUPPORTED_CHAIN_KEYS=sepolia,amoy
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_SYNC_ENABLED=true
```

For production Netlify deployment, `NEXT_PUBLIC_API_BASE_URL` must point to the deployed Render API URL, not `localhost`.

### Backend (`hillside-api`)

Common required values:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_CORS_ALLOWED_ORIGINS=
API_JWT_ISSUER=
API_JWT_AUDIENCE=authenticated
QR_SIGNING_SECRET=
CHAIN_ACTIVE_KEY=sepolia
CHAIN_ALLOWED_KEYS=sepolia,amoy
EVM_RPC_URL_SEPOLIA=
ESCROW_CONTRACT_ADDRESS_SEPOLIA=
GUEST_PASS_CONTRACT_ADDRESS_SEPOLIA=
AI_SERVICE_BASE_URL=
AI_REQUIRE_PROPHET_FORECAST=false
```

### AI (`hillside-ai`)

The AI service can be deployed separately on Render. The backend should point to it through:

```txt
AI_SERVICE_BASE_URL=https://your-hillside-ai-service.onrender.com
AI_REQUIRE_PROPHET_FORECAST=false
```

When AI is unavailable or Prophet/scikit-learn cannot produce a model result, the backend is expected to use safe fallback behavior.

## Deployment

### Frontend: Netlify

Netlify uses `netlify.toml` at the repository root.

Current build command:

```bash
npm install --workspace hillside-next lightningcss-linux-x64-gnu@1.31.1 @tailwindcss/oxide-linux-x64-gnu@4.2.0 --no-save && npm run build --workspace hillside-next
```

Publish directory:

```txt
hillside-next/.next
```

### Backend: Render

Render uses:

```txt
render.yaml
```

The active API service root is:

```txt
hillside-api/
```

Health check:

```txt
/health
```

### AI Service: Render

Deploy `hillside-ai/` as a separate Python web service when real model responses are needed.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm run test:api
npm run test:contracts
npm run quality:gate
```

Useful frontend-only checks:

```bash
npm --workspace hillside-next run lint
npm --workspace hillside-next run build
```

## Documentation Map

Important reviewer-facing docs:

- `PROJECT_OVERVIEW.md` - current single-source overview (stack, architecture, schema, endpoints, key flows)
- `PROJECT_ALIGNMENT.md` - primary project direction and architecture alignment guide
- `docs/capstone/` - demo runbook, defense talk track, and capstone support checklists
- `docs/re-architecture-core/` - detailed architecture and V2 implementation notes
- `hillside-next/README.md` - active frontend route/API notes
- `hillside-api/README.md` - backend notes
- `hillside-ai/README.md` - AI service notes
- `hillside-contracts/README.md` - smart contract notes

## Instructor Review Guide

Recommended review order:

1. Read this root `README.md`.
2. Read `PROJECT_OVERVIEW.md` (current system overview) and `PROJECT_ALIGNMENT.md` (project direction).
3. Inspect `hillside-next/` for the active PWA UI.
4. Inspect `hillside-api/` for backend reservation/payment/QR logic.
5. Inspect `supabase/migrations/` for database changes.
6. Inspect `hillside-contracts/` for Sepolia demo contract logic.
7. Inspect `hillside-ai/` for AI service behavior.

## Security and Privacy Rules

- Never expose Supabase service role keys in frontend code.
- Keep guest PII off-chain.
- Store guest data in Supabase.
- Store only hashes, proofs, transaction references, and audit-safe metadata on-chain.
- Keep Sepolia as the active demo chain.
- Treat Polygon L2 as the future cutover target.

## One-Sentence Summary

Hillside Hidden Resort is a Next.js 15 PWA with FastAPI, Supabase, role-based staff access, QR-based check-in, promotions, reviews, in-app notifications, an automated booking lifecycle, offline-friendly guest/admin workflows, AI-assisted resort intelligence, and Sepolia-backed auditability, with Polygon L2 retained as a future deployment target.
