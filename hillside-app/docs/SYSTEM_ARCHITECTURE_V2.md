# SYSTEM_ARCHITECTURE_V2

## 1) Context (C4 - System Level)

Hillside Hidden Resort provides guest booking, payment, QR-based check-in, and resort operations management. V2 introduces blockchain escrow and AI services while preserving existing Supabase data/auth as migration baseline.

Primary actors:

- Guest (mobile-first web/PWA)
- Admin/Resort staff
- Resort accountant/operations manager
- Polygon network (Amoy in first rollout)
- AI inference service

Primary external systems:

- Supabase (Postgres/Auth/Storage)
- Polygon RPC provider
- Object storage (proofs/media)

## 2) Containers (C4 - Container Level)

### A. Frontend Container

- Current: React/Vite guest and admin UIs.
- Target: Next.js 15 PWA shell (guest/admin surfaces, BFF utilities).
- Responsibilities: user interactions, offline cache, QR rendering/scanning, feature-flag path selection.

### B. API Container

- Target: FastAPI domain API.
- Responsibilities: authorization, orchestration, idempotency, business state machine, chain integration, AI aggregation.

### C. Data Container

- Supabase Postgres/Auth/Storage (source-of-truth in initial waves).
- Responsibilities: durable reservation/payment/QR metadata and audit history.

### D. Blockchain Container

- Polygon Amoy contracts for escrow lock/settlement state.
- Responsibilities: immutable escrow lifecycle and transaction/event auditability.

### E. AI Container

- Prophet/scikit-learn service (pricing, occupancy forecasts, recommendations).
- Responsibilities: inference only; never blocks critical booking writes.

## 3) Components (C4 - Component Level)

### Frontend components

- Booking UI + calendar and availability flows.
- Payment submission and proof upload flows.
- QR token display/scanner components.
- Admin operations dashboards.

### API components (FastAPI target)

- `auth/session` component.
- `reservations` component.
- `payments/escrow` component.
- `qr/checkin` component.
- `reports/ai` component.
- `reconciliation` worker component.

### Data components

- Existing tables (`reservations`, `payments`, `service_bookings`, etc.).
- New V2 support data:
  - `reservations.escrow_state`
  - `reservations.chain_tx_hash`
  - `reservations.onchain_booking_id`
  - `qr_tokens`
  - `pricing_signals`

## 4) End-to-End Data Flows

### 4.1 Booking Flow

1. Guest submits booking request.
2. API validates availability and deposit rules.
3. API writes booking to Supabase (authoritative write).
4. API emits `reservation.created` event.
5. If escrow feature flag enabled, API initiates escrow lock (shadow or primary mode).

### 4.2 Escrow Lock Flow

1. API calls escrow contract `lock(...)` on Polygon Amoy.
2. Contract emits lock event.
3. API listener captures `tx_hash`, `event_index`, confirmation depth.
4. API persists `escrow_ref` into reservation record.
5. Event `escrow.locked` emitted for downstream consumers.

### 4.3 QR Issuance + Rotation Flow

1. API issues signed QR token (`jti`, reservation reference, expiry, signature).
2. Token rotates every configured interval (target: 30 seconds).
3. Previous token version invalidated server-side.
4. Event `qr.issued` emitted.

### 4.4 Arrival Verification Flow

1. Staff scanner submits token to API verifier.
2. API validates signature, expiry, nonce/replay cache, reservation eligibility.
3. If offline mode: scanner validates cached signature policy and queues verification.
4. On reconnect, queue sync verifies and finalizes check-in.
5. Event `checkin.verified` emitted.

### 4.5 Settlement Flow

1. API computes verified paid amount + escrow settlement rules.
2. If checkout criteria met, API triggers contract settlement (if enabled).
3. API updates reservation to `checked_out` and final financial state.
4. Event `settlement.completed` emitted.

## 5) Trust Boundaries and Security Control Placement

### Boundary 1: Browser/App <-> API

- Controls: JWT/session validation, CSRF strategy, rate limiting, request validation.
- Correlation ID created at edge and propagated downstream.

### Boundary 2: API <-> Supabase

- Controls: service-role secret isolation, least privilege policies, immutable audit writes.

### Boundary 3: API <-> Blockchain

- Controls: server-side key custody (vault), confirmation thresholds, idempotent tx processing.

### Boundary 4: Offline Cache

- Controls: AES-256 encryption for IndexedDB payloads, short TTL QR tokens, replay prevention.

### Boundary 5: AI Service

- Controls: strict request schema, timeout/fallback, no direct PII leakage.

## 6) Offline Behavior Model

Cached locally:

- Signed QR token metadata (short-lived).
- Offline scan queue records with timestamp and scanner identity.
- Minimal reservation context needed for on-site validation UX.

Signed artifacts:

- QR token payload with server signature and nonce (`jti`).

Offline verification model:

1. Validate signature with cached key set.
2. Validate expiration/rotation version.
3. Queue final server verification when network is unavailable.

## 7) Chain Interaction Model

### Contract events (target minimum)

- `EscrowLocked(bookingId, amount, payer, asset, timestamp)`
- `EscrowReleased(bookingId, recipient, amount, timestamp)`
- `EscrowRefunded(bookingId, recipient, amount, timestamp)`

### Finalization rules

- Reservation should not move to irreversible financial state until required block confirmations are met.
- Pending chain state must be explicit in `escrow_ref.state`.

### Reconciliation process

1. Poll/listen chain events.
2. Match by `onchain_booking_id` and `tx_hash`.
3. Detect mismatches (missing off-chain row, duplicated event, invalid state transition).
4. Push mismatch metrics/alerts and move to manual review queue where needed.

## 8) Canonical Status Model (Shared)

`draft -> pending_payment -> escrow_locked -> for_verification -> confirmed -> checked_in -> checked_out`

Terminal states:

- `cancelled`
- `no_show`

All runtime layers (frontend, API, DB, chain adapters) must use compatible mappings to this status model.
