# Project Status - Hillside Hidden Resort

Last updated: 2026-02-21

## Re-Architecture Program Status

Program mode: `Phased Strangler (active)`

Current production path remains stable on `React/Vite + Supabase` while V2 foundation is being introduced in parallel.

## Wave Checkpoints

| Wave | Scope | Status | Exit Signal |
|---|---|---|---|
| Wave 0 - Foundation | Next.js shell, FastAPI bootstrap, multi-chain contract scaffolding (Sepolia/Amoy), shared status model | Complete | Skeleton services run in CI, docs/contracts are versioned, and Sepolia chain config is live |
| Wave 1 - API Facade | FastAPI wrappers for reservations/payments/QR/reports/units over current Supabase data | Complete | Legacy UI read/write/report workflows run against V2 facade endpoints with fallback |
| Wave 2 - Escrow Ledger | Polygon/Sepolia escrow shadow-write + reconciliation | In Progress | Escrow lock success and mismatch rate within threshold |
| Wave 3 - QR Hardening | Dynamic signed QR rotation + anti-replay + offline queue verification | Complete | Replay blocked and offline queue reconciles deterministically |
| Wave 4 - AI Intelligence | Pricing and occupancy service integration (non-blocking) | Complete | Inference latency/fallback SLO met |
| Wave 5 - Dashboard Convergence | Next.js admin/guest convergence + legacy deprecation | Complete | Feature parity complete and facade-on burn-in checklist passed (2026-02-21) |

## Legacy Delivery State (Already Implemented)

- Reservations with overlap prevention and tour support.
- Payments submission/verification and on-site settlement workflows.
- QR check-in/out flows with admin scanner path.
- Audit logs and blockchain anchoring demo flow.
- Reports, CSV exports, and analytics dashboards.

## Active Risks and Dependencies

### Cross-stack migration risks

1. Dual-write drift between legacy and new APIs.
2. Status model mismatch across SQL RPCs, FastAPI, and chain event handlers.
3. QR replay/offline edge cases during token-service migration.
4. Operational complexity while both legacy and V2 paths coexist.

### External dependencies

1. Public testnet faucet and RPC reliability (Sepolia/Amoy).
2. Secret management for custodial signing keys.
3. AI service hosting/runtime for Prophet/scikit-learn models.
4. CI/CD pipelines for multi-runtime deployment (frontend + API + contracts).

## Deprecation Plan (Legacy-Only Paths)

1. Mark legacy-only endpoints as `deprecated` once V2 equivalent is production-ready.
2. Keep compatibility adapter until parity metrics are stable for at least one release cycle.
3. Disable deprecated write paths first (read-only fallback), then remove after archival checks.
4. Preserve immutable payment/audit history during all cutover operations.

## Re-Architecture Decisions (Locked)

1. Migration strategy: phased strangler.
2. First wave: platform foundation.
3. Data/auth source-of-truth initially: Supabase.
4. Chain target: multi-chain capable (`sepolia` active in dev, `amoy` retained for cutover).
5. Wallet strategy: custodial default + optional non-custodial extension.
6. ZKP requirement deferred to a future phase.

## Immediate Next Actions

1. Backfill Sepolia deployment proof fields (`deploy_tx_hash`, `deployed_at_utc`) from Etherscan for audit completeness.
2. Define and lock Wave 2 SLOs (lock success %, reconciliation mismatch ceiling, settlement success latency) before status flip.
3. Execute legacy deprecation timetable milestones in `hillside-app/docs/LEGACY_DEPRECATION_TIMETABLE.md`.
4. Plan removal of non-essential facade-off fallbacks after deprecation gate closes.

## Foundation Progress Notes

Completed in this iteration:

1. Added `hillside-next` scaffold (Next.js shell + health route + env contract).
2. Added `hillside-api` scaffold (FastAPI app + v2 route groups + shared status schema + initial Supabase reservation reads).
3. Added `hillside-contracts` scaffold (Hardhat config + `EscrowLedger` contract + deploy script + event schema alignment for escrow lifecycle).
4. Added Next.js V2 vertical slices for guest My Bookings, admin Reservations, and admin Payments.
5. Removed redundant client-side session bootstrap in these V2 pages; server-side auth gate is now primary.
6. Added Next.js V2 vertical slices for guest Tours and admin Reports (server-first prefetch + V2 APIs).
7. Added file-upload parity for payment proof submission in V2 guest flows (tour + My Bookings submit modal).
8. Added Next.js V2 admin Check-in slice (`/admin/check-in`) wired to `/v2/qr/verify` and `/v2/operations/*`.
9. Updated V2 API integration to use user-scoped JWT context for QR validation and check-in/out operations.
10. Added Next.js V2 admin Audit Logs slice (`/admin/audit`) wired to `/v2/audit/logs`.
11. Added FastAPI V2 audit endpoint with filtering + pagination and shared API contracts.
12. Added FastAPI V2 units endpoints (`GET /v2/units`, `PATCH /v2/units/{unit_id}/status`) and Next.js admin Units slice (`/admin/units`).
13. Added Next.js V2 admin Walk-in Tour slice (`/admin/walk-in-tour`) and enabled admin same-day walk-in tour creation on `POST /v2/reservations/tours`.
14. Migrated Next.js admin Dashboard widgets to live V2-backed metrics (units, reservations, payments, report snapshot).
15. Added `GET /v2/dashboard/summary` and switched Next.js admin dashboard to single-request summary hydration.
16. Added/updated FastAPI contract tests for V2 dashboard summary, units endpoints, and admin/guest tour reservation guardrails.
17. Added API/DB performance instrumentation for monitored V2 routes and admin diagnostics (`GET /v2/dashboard/perf`).
18. Added multi-chain runtime configuration in FastAPI (`sepolia` + `amoy`) with env-based active chain switching.
19. Added multi-chain deployment support in `hillside-contracts` (`deploy:sepolia`, `deploy:amoy`).
20. Verified live health contract reports `sepolia` as active chain with RPC and contract configured.
21. Verified contracts workspace build (`npm --prefix hillside-contracts run build`).
22. Added FastAPI V2 unit write endpoints (`POST /v2/units`, `PATCH /v2/units/{unit_id}`, `DELETE /v2/units/{unit_id}`).
23. Added FastAPI V2 reports transactions endpoint (`GET /v2/reports/transactions`) for CSV export source parity.
24. Cut legacy facade paths in `hillside-app` to V2-first for unit write methods and report transaction export (with fallback kept).
25. Added/updated shared contracts in `packages/shared` for unit writes and report transaction responses.
26. Validated API contract suite (`46 passed`) including new units/reports endpoint tests.
27. Started Wave 2 kickoff: added feature-flagged reservation escrow shadow-write metadata persistence in FastAPI create reservation paths.
28. Added Supabase migration for escrow shadow metadata columns (`20260220_001_wave2_escrow_shadow_metadata.sql`).
29. Fixed Supabase client compatibility in escrow shadow metadata write path (update+read pattern, no chained `select` on update builder).
30. Verified end-to-end shadow-write result:
    - API create reservation response now includes non-null `escrow_ref`.
    - Latest reservation row persists `escrow_state='pending_lock'`, `chain_key='sepolia'`, `chain_id=11155111`, and non-null `chain_tx_hash`.
31. Enabled optional real on-chain lock path in reservation create flow (`FEATURE_ESCROW_ONCHAIN_LOCK=true`) with persisted `locked` metadata.
32. Added admin escrow diagnostics endpoint (`GET /v2/escrow/reconciliation`) with match/mismatch/missing-onchain classification.
33. Added API-side guardrail for payment submissions: `proof_url` is now required and rejected early with `400`.
34. Added reconciliation summary counters (`match`, `mismatch`, `missing_onchain`, `skipped`, `alert`) for threshold monitoring.
35. Added Next.js admin Escrow page (`/admin/escrow`) and navigation entry for reconciliation visibility.
36. Added escrow settlement integration on checkout and cancel flows:
    - Checkout now attempts on-chain `release` and persists `escrow_state='released'` metadata.
    - Cancel now attempts on-chain `refund` and persists `escrow_state='refunded'` metadata.
37. Added contract tests for settlement paths and reran V2 API suite subset (`26 passed`).
38. Fixed Next.js admin check-in route mismatch (`/v2/operations/*` -> `/v2/checkins|/v2/checkouts`) to remove UI `404` on override/check-out actions.
39. Added admin-only stale shadow cleanup endpoint (`POST /v2/escrow/cleanup-shadow`) with dry-run and guarded execute mode.
40. Added automated API tests for:
    - Check-in override -> check-out -> escrow release shadow write.
    - Escrow cleanup endpoint auth + dry-run + execute behavior.
41. Added escrow reconciliation scheduler + monitor endpoints:
    - Feature flag: `FEATURE_ESCROW_RECONCILIATION_SCHEDULER`
    - Monitor APIs: `GET /v2/escrow/reconciliation-monitor`, `POST /v2/escrow/reconciliation-monitor/run`
    - Threshold-based alert activation for mismatch/missing-onchain/skipped counters.
42. Started Wave 3 API-first QR hardening:
    - Added dynamic QR token issue path (`POST /v2/qr/issue`) with HMAC signing and rotation window.
    - Added dynamic verify support in `POST /v2/qr/verify` (`qr_token` mode + legacy reservation-code mode).
    - Added anti-replay token store integration (`public.qr_tokens`) and replay block (`409` on reuse).
43. Added Supabase migration `20260221_001_wave3_qr_tokens.sql` for dynamic QR token lifecycle storage.
44. Added/updated contract tests for dynamic QR issue/verify replay blocking (`tests/test_v2_qr_operations_contract.py`).
45. Wired Next.js admin check-in UI to support dynamic `qr_token` validation mode (JSON payload) in addition to reservation-code mode.
46. Added Next.js guest "Show check-in QR" flow in My Bookings:
    - Calls `POST /v2/qr/issue`
    - Auto-refreshes token
    - Shows expiry/countdown and copyable token payload for scanner handoff.
47. Added admin check-in offline QR queue UX in Next.js:
    - Network-failure queue to localStorage
    - Manual sync action (`Sync queued tokens`)
    - Queue clear action
    - Queue count indicator
48. Validated Wave 3 QR behavior end-to-end:
    - Expired token returns `410`
    - Replay token returns `409`
    - Offline queued token sync returns success (`1 synced, 0 dropped`) within active rotation window.
49. Started Wave 4 AI bootstrap:
    - Added FastAPI AI pricing contract endpoint (`POST /v2/ai/pricing/recommendation`).
    - Kept alias route for compatibility (`POST /v2/ai/pricing/predict`).
50. Added non-blocking AI recommendation integration in reservation create flows:
    - `POST /v2/reservations`
    - `POST /v2/reservations/tours`
    - On AI service failure/timeout, booking still succeeds and `ai_recommendation` safely falls back to `null`.
51. Added Wave 4 contract tests for AI endpoint and reservation non-blocking behavior.
52. Surfaced AI pricing insight in Next.js guest `My Bookings` detail modal (loading/error/fallback/live states).
53. Surfaced AI pricing insight in Next.js admin reservation detail modal for parity with guest UX.
54. Fixed AI inference timeout budget handling in API integration:
    - `AI_INFERENCE_TIMEOUT_MS` is now respected up to a `10s` safety cap (was effectively capped at `300ms`).
55. Added admin AI monitoring endpoint (`GET /v2/ai/pricing/metrics`) with fallback-rate and latency snapshot for Wave 4 observability.
56. Added Next.js admin dashboard "AI Pricing Monitor" card backed by `/v2/ai/pricing/metrics`.
57. Added `hillside-ai` local FastAPI service scaffold (`/v1/pricing/recommendation`) for Wave 4 live inference testing against `AI_SERVICE_BASE_URL`.
58. Started Wave 5 route convergence in Next.js:
    - added legacy admin path redirects (`/admin/scan`, `/admin/tours/new`, `/admin/reservations/new`, `/admin/units/new`, `/admin/units/:unitId/edit`).
    - added deep-link compatibility for `/admin/reservations/:reservationId` via query-based auto-open in `AdminReservationsClient`.
59. Migrated legacy `auditService.fetchAuditLogs` to V2-first (`GET /v2/audit/logs`) with fallback kept for facade-off mode.
60. Added Wave 5 cutover source-of-truth matrix (`hillside-app/docs/WAVE5_CUTOVER_MATRIX.md`) for route parity and remaining direct Supabase service paths.
61. Completed missing V2 API endpoints for Wave 5 parity:
    - `GET /v2/units/{unit_id}`
    - `POST /v2/payments/on-site`
    - `PATCH /v2/reservations/{reservation_id}/status`
62. Switched remaining targeted legacy services to V2-first (fallback retained):
    - `unitsService.fetchUnit`
    - `paymentsService.recordOnSitePayment`
    - `reservationsService.updateReservationStatus`
63. Added Next.js admin UI wiring for these actions:
    - Units `View/Edit` modal + save flow
    - Payments `Record On-site Payment` form
    - Reservations details modal `Admin status patch`
64. Facade-on acceptance pass completed across migrated admin flows with clean escrow reconciliation:
    - `mismatch = 0`
    - `missing_onchain = 0`
    - `alert = false`
65. Completed Next.js root role-based parity (`/`) and published Wave 5 legacy deprecation timetable for React runtime sunset planning.
66. Removed legacy direct report table-read helpers in `reportsService` (`fetchReservationsInRange`, `fetchVerifiedPaymentsInRange`) to finalize V2-first report data sourcing.
67. Fixed My Bookings tab switching stale-data issue by limiting SSR upcoming-data skip to initial hydration only.
68. Added scannable QR rendering in guest `Show check-in QR` modal while keeping JSON payload copy fallback.
69. Aligned guest tour payment-proof validation copy/guards with API contract (`proof_url` required for online guest submission).

## Wave 0 Deployment Evidence (Sepolia Active)

- `chain`: `sepolia`
- `chain_id`: `11155111`
- `contract_address`: `0xd000e9c7442dC487CFa4C9dC8E4E620a8fbA1C04`
- `deploy_tx_hash`: `TBD (retrieve from Etherscan contract page)`
- `deployed_at_utc`: `TBD (retrieve from Etherscan transaction timestamp)`

### Smoke Checks (completed)

1. `GET /health` returns:
   - `active_chain.key = sepolia`
   - `active_chain.rpc_configured = true`
   - `active_chain.contract_configured = true`
2. `GET /v2/chains` (admin-authenticated check via app network response) returns:
   - `active_chain.key = sepolia`
   - `chains.sepolia.enabled = true`
   - `chains.sepolia.contract_configured = true`
3. `npm --prefix hillside-contracts run build` passes.

## Acceptance Gate for Foundation Completion

Wave 0 completion checklist:

1. Next.js shell runs and can authenticate against Supabase.
2. FastAPI service is deployed and reachable from dev/staging.
3. Contract workspace compiles/deploys to active public testnet (`sepolia` in dev; `amoy` supported).
4. Canonical API and event contracts are versioned (`docs/API_SURFACE_V2.md`).
5. Sepolia deployment evidence fields are documented (`contract_address`, `deploy_tx_hash`, `deployed_at_utc`).

## Wave 1 Exit Checklist (Completed)

1. Added missing V2 endpoints for unit writes and report transaction export source.
2. Updated shared DTOs/schemas in `packages/shared` for new endpoint contracts.
3. Cut legacy UI service methods to V2-first with fallback for:
   - `createUnit`
   - `updateUnit`
   - `softDeleteUnit`
   - `fetchPaymentTransactionsInRange`
4. Verified facade behavior with API contract tests:
   - `hillside-api/tests` -> `48 passed`.
5. Legacy fallback path remains available for staged deprecation.

## Wave 2 Reconciliation Baseline (Manual Verification)

Validation snapshot (admin-authenticated `GET /v2/escrow/reconciliation?limit=200&offset=0`):

- `total = 15`
- `match = 15`
- `mismatch = 0`
- `missing_onchain = 0`
- `skipped = 0`
- `alert = false`

Interpretation:

1. Current reconciliation baseline is clean (no unresolved on-chain drift in sampled set).
2. Wave 2 remains `In Progress` until scheduled reconciliation + alert automation and agreed SLO thresholds are finalized.

## Wave 3 QR Validation Evidence (Manual Verification)

Validation checks completed:

1. `POST /v2/qr/issue` returns signed token payload (`jti`, `reservation_id`, `expires_at`, `signature`, `rotation_version`).
2. `POST /v2/qr/verify` with same token twice:
   - first request accepted (`200`)
   - second request blocked (`409`, `QR token already used`).
3. Expired token validation returns `410` (`QR token expired`).
4. Admin offline queue flow:
   - token queued while network offline (`Queued tokens: 1`)
   - token synced on reconnect (`Sync complete: 1 synced, 0 dropped, 0 remaining`).
5. Dev-only rotation window adjusted to `QR_ROTATION_SECONDS=120` for stable offline/reconnect testing.

Wave 3 exit decision:

1. `Complete` based on verified anti-replay (`409`), expiry enforcement (`410`), and deterministic offline queue sync (`1 synced, 0 dropped`) in admin token flow.

## Wave 4 AI Validation Evidence (Manual Verification)

Validation snapshot (`GET /v2/ai/pricing/metrics` after enabling local `hillside-ai` service):

- `total_requests = 2`
- `remote_success = 2`
- `fallback_count = 0`
- `fallback_rate = 0.0`
- `latency_ms.p95 = 1576.27`

Additional UI evidence:

1. Guest/Admin reservation details now show `AI Pricing Insight` with `live` badge.
2. `AI Pricing Monitor` card on Next.js admin dashboard displays live counters from `/v2/ai/pricing/metrics`.

Wave 4 exit decision:

1. `Complete` based on observed live inference (`remote_success > 0`) and zero fallback in verification sample.

## Wave 5 Burn-In Validation Evidence (Manual Verification)

Validation checks completed:

1. Guest critical flows pass in `hillside-next`:
   - room/tour reservation create
   - payment proof submission (`pending_payment -> for_verification`)
   - My Bookings tab refresh/switch behavior
   - check-in QR modal token generation with rotating payload + scannable QR render
2. Admin critical flows pass in `hillside-next`:
   - units detail/edit/activate/deactivate
   - reservations status patch
   - payments verify/reject/on-site record
   - check-in override and check-out release path
   - reports/audit reads
3. Escrow diagnostics clean after burn-in activity:
   - reconciliation summary shows `mismatch = 0`, `missing_onchain = 0`, `alert = false`
4. Reconciliation monitor run endpoint and monitor status endpoint verified in facade-on mode.

Wave 5 exit decision:

1. `Complete` based on route/service parity and successful facade-on burn-in across guest/admin critical flows.
