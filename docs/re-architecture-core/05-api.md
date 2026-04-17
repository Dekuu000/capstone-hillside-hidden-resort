# API Core (FastAPI V2)

## Endpoint groups

- `Auth`: `/v2/auth/*`
- `Reservations`: `/v2/reservations`, `/v2/me/bookings`
- `Profile`: `/v2/me/profile`
- `Payments`: `/v2/payments/*`
- `QR/Check-in`: `/v2/qr/*`, `/v2/checkins/*`
- `Guest Services`: `/v2/guest/services*`
- `Admin Services`: `/v2/admin/services*`
- `AI/Reports`: `/v2/ai/*`, `/v2/reports/*`
- `Dashboard`: `/v2/dashboard/*`

## AI endpoints in use (Module C)

- `GET /v2/ai/pricing/metrics`
  - Returns pricing service health/perf metrics for admin dashboards.
- `POST /v2/ai/pricing/recommendation`
  - Generates a pricing adjustment recommendation with confidence, explanations, and optional `suggested_multiplier` / `demand_bucket`.
  - Persists generated recommendations to `public.ai_pricing_suggestions` (anonymized features payload).
- `POST /v2/ai/pricing/predict`
  - Compatibility alias of recommendation endpoint.
- `POST /v2/ai/pricing/apply`
  - Logs admin pricing decisions into audit-style records for defense traceability.
- `POST /v2/ai/occupancy/forecast`
  - Generates occupancy forecast (Prophet primary) and persists outputs to `public.ai_forecasts`.
  - Supports TTL reuse of latest saved forecast to keep endpoint latency stable.
  - Optional runtime guardrail: `AI_REQUIRE_PROPHET_FORECAST=true` enforces Prophet path for defense runs (returns `503` when only fallback model path is available).
- `POST /v2/ai/concierge/recommendation`
  - Returns concierge suggestions using anonymized segment keys.
  - Persists generated suggestion runs to `public.ai_concierge_suggestions` (no PII).

## Contract principles

- Idempotent write paths where retry is expected.
- Deterministic status transitions.
- Authorization by Supabase bearer token + role context.
- Lean list DTOs, detailed views fetched on demand.
- AI Center operational guardrails use pricing metrics thresholds:
  - fallback warning at `>=25%`, critical at `>=50%`
  - p95 latency warning at `>=1800ms`, critical at `>=3000ms`
- Offline preload for check-in uses existing endpoints only (no new backend contract):
  - `GET /v2/reservations` for arrival candidates
  - `POST /v2/qr/issue` for signed token snapshot per arrival
  - `GET /v2/qr/public-key` for offline signature verification key distribution
  - `POST /v2/qr/verify` / check-in operations remain authoritative at sync time

## Interface Design Outline (Sitemap) endpoints

- `GET /v2/me/profile`
  - Returns guest profile fields: `name`, `phone`, `email`, `wallet_address`, `wallet_chain`.
- `PATCH /v2/me/profile`
  - Updates guest profile and optional wallet binding.
  - Current phase: wallet is optional and not required to create a reservation.
- `POST /v2/reservations`
  - Requires `guest_count` and enforces capacity constraints.
  - Current phase: wallet is not part of reservation validation.
- `GET /v2/guest/services`
  - Returns active digital service catalog items (room service/spa).
- `POST /v2/guest/services/requests`
  - Creates a guest service request with optional reservation link.
- `GET /v2/guest/services/requests`
  - Returns request timeline for the authenticated guest.
- `GET /v2/admin/services/requests`
  - Admin queue list with filter support (`status`, `category`, search/date/limit/offset).
- `PATCH /v2/admin/services/requests/{request_id}`
  - Admin status update path (`new`, `in_progress`, `done`, `cancelled`).

## Module D dashboard endpoints

- `GET /v2/dashboard/resort-snapshot`
  - Aggregated admin resort view payload:
    - `occupancy`: occupied vs active units + occupancy rate
    - `revenue`: FIAT 7-day cash collection + native crypto total/tx count
    - `ai_demand_7d`: model status + 7-day occupancy demand points
  - Crypto KPI is chain-native (`ETH`) in this phase (no FX conversion).
  - AI demand degrades safely to `missing` when forecast data is unavailable.

- Existing retained endpoints (still used, not broken):
  - `GET /v2/dashboard/summary`
  - `GET /v2/dashboard/perf`
  - `GET /v2/units`, `PATCH /v2/units/{unit_id}`
  - `GET /v2/escrow/reconciliation`

## Blockchain Explorer (internal) endpoints

- `GET /v2/escrow/contract-status`
  - Query:
    - `chain_key` optional (`sepolia|amoy`), defaults to active chain
    - `window_days` optional (`1..30`), default `7`
    - `limit` optional (`1..100`), default `20`
  - Response:
    - `as_of`, `chain_key`, `chain_id`, `contract_address`, `explorer_base_url`, `window_days`
    - `gas`:
      - `base_fee_gwei`
      - `priority_fee_gwei`
      - `source` (`live|cached|unavailable`)
      - `stale`
      - `last_updated_at`
      - `note`
    - `successful_tx_count` (escrow-only successful states with tx hash in window)
    - `pending_escrows_count` (`pending_lock`)
    - `recent_successful_txs[]`:
      - `reservation_id`
      - `reservation_code`
      - `escrow_state`
      - `chain_tx_hash`
      - `onchain_booking_id`
      - `updated_at`

- Existing reused endpoint in unified explorer:
  - `GET /v2/audit/logs`
  - default UI filter is reservation scope (`entity_type=reservation`)

## Event model (planned)

- `reservation.created`
- `escrow.locked`
- `qr.issued`
- `checkin.verified`
- `settlement.completed`
