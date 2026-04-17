# Modules Mapping

## Guide module to runtime mapping

| Module | Current Owner | V2 Owner |
|---|---|---|
| Reservation lifecycle | Supabase RPC + React services | FastAPI reservations + Next.js |
| Payment verification | Supabase + legacy admin UI | FastAPI payments + Next.js admin |
| QR check-in | Legacy UI + Supabase flows | FastAPI QR service + Next.js |
| Blockchain anchoring/ledger | Supabase edge function (anchor demo) | Solidity + FastAPI ethers bridge |
| AI recommendations | Rule-based analytics | FastAPI -> AI inference service |

## Module C mapping (AI Hospitality Intelligence)

- Admin AI Center route: `/admin/ai`
- Pricing tab:
  - `GET /v2/ai/pricing/metrics`
  - `POST /v2/ai/pricing/recommendation`
  - `POST /v2/ai/pricing/apply` (decision logging)
  - persistence table: `public.ai_pricing_suggestions`
  - model: `sklearn-ridge-pricing-v1` (fallback available)
- Forecast tab:
  - `POST /v2/ai/occupancy/forecast`
  - persistence table: `public.ai_forecasts`
  - model: `prophet-occupancy-v1` (fallback to sklearn/heuristic as needed)
  - demo guardrail: `AI_REQUIRE_PROPHET_FORECAST=true` to enforce Prophet path in defense runs
- Concierge tab (MVP):
  - `POST /v2/ai/concierge/recommendation`
  - input uses anonymized `segment_key` (no PII)
  - persistence table: `public.ai_concierge_suggestions`
  - model: `sklearn-segment-similarity-v1` (fallback rules available)

## Module D mapping (Resort Management Dashboard)

- Admin resort dashboard route: `/admin`
  - primary blocks:
    - `Resort Snapshot`
    - `Room Management`
    - `Guest Verification`
  - focused scope (legacy dense panels moved off dashboard):
    - ledger reconciliation remains in `/admin/escrow`
    - report analytics remain in `/admin/reports`
- Snapshot endpoint:
  - `GET /v2/dashboard/resort-snapshot`
  - occupancy source: `units` (`is_active`, `operational_status=occupied`)
  - fiat source: report summary (`cash_collected`, last 7 days)
  - crypto source: reconciliation cached rows (`onchain_amount_wei`, tx hash)
  - AI demand source: latest `ai_forecasts` occupancy series (next 7 days)
- Room Management form (dashboard quick-edit):
  - reads from `GET /v2/units`
  - writes via `PATCH /v2/units/{unit_id}`
  - "pricing override" maps to direct `base_price` update
  - status management uses `is_active` + `operational_status`
- Guest Verification launcher:
  - scan: `/admin/check-in?mode=scan`
  - code fallback: `/admin/check-in?mode=code`
  - tablet layout: `/admin/check-in?view=tablet&mode=scan`

## Blockchain Explorer (Internal) mapping

- Unified admin route: `/admin/blockchain`
  - tab 1: `Contract Status`
  - tab 2: `Audit Logs`
- Contract status data contract:
  - `GET /v2/escrow/contract-status`
  - query: `chain_key`, `window_days`, `limit`
  - gas snapshot source policy:
    - `live` when RPC read succeeds
    - `cached` when live read fails but recent cached snapshot exists
    - `unavailable` when no live/cached gas snapshot exists
  - successful tx KPI scope: escrow-only (`locked`, `released`, `refunded` with tx hash)
  - pending KPI scope: `escrow_state=pending_lock`
- Audit logs tab default:
  - `GET /v2/audit/logs`
  - default filter `entity_type=reservation`
- Backward-compatible retained pages:
  - `/admin/escrow`
  - `/admin/audit-logs`

## Shared package ownership

- `packages/shared/src/types.ts`: shared domain types for all TS runtimes.
- `packages/shared/src/schemas.ts`: zod schemas for request/event payload validation.

## Module B mapping (QR-Based PWA Check-In, Offline-first)

- Admin check-in console route: `/admin/check-in`
  - Scan tab: offline-first token validation + queued check-in/check-out actions
  - Code tab: online-first; offline validation only via preloaded arrivals pack
  - Queue tab: pending/synced/failed action list with manual sync controls
- Preload pack persistence: `hillside-next/lib/checkinOfflineCache.ts` (IndexedDB)
  - includes `today + tomorrow` arrivals, pack metadata (`generated_at`, `valid_until`, `count`)
- Offline queue persistence: `hillside-next/lib/secureOfflineQueue.ts` (encrypted IndexedDB)
- Guest QR offline shell:
  - route: `/guest/my-stay`
  - last issued token cache: `hillside-next/lib/guestQrTokenCache.ts`
- Resort navigation offline MVP:
  - route: `/guest/map`
  - assets: `/public/images/resort-map.svg`, `/public/data/guest-map-amenities.json`

## Interface Design Outline (Sitemap) mapping (Guest Portal + Services)

- Guest portal routes:
  - `/book` (reservation management form)
  - `/guest/reserve` (alias to `/book`)
  - `/guest/my-stay` (countdown + room display + QR action)
  - `/guest/map` (offline-first explore map)
  - `/guest/services` (digital services menu + request history)
- Admin operations route:
  - `/admin/services` (service request queue and status handling)
- Data model additions:
  - `public.units`: `unit_code`, `room_number`
  - `public.users`: `wallet_address`, `wallet_chain`
  - `public.reservations`: `guest_count`
  - `public.resort_services`, `public.resort_service_requests`
- Shared contracts:
  - `packages/shared/src/schemas.ts`
  - `packages/shared/src/types.ts`
- Wallet connection note (current phase):
  - wallet is optional and profile-only (`/v2/me/profile`).
  - booking does not require wallet connection in this phase.
  - wallet-required booking rules are deferred to a later outline/module.
