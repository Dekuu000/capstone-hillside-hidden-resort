# Cleanup & Refactor Checklist (Post-Phase)

Last updated: 2026-04-25  
Status: In progress  
Execution gate: Start only after P0-P2 closure (decision-locked)

## Objective

Reduce technical debt and improve maintainability/scalability without changing approved business behavior.

## Rules of Engagement

1. Keep feature behavior unchanged unless explicitly approved.
2. Work in small batches with passing tests after each batch.
3. Remove dead/duplicate code only when replacement path is verified.
4. Document every removal or refactor in this checklist.

## Execution Order

1. Baseline and inventory.
2. API/service cleanup.
3. Frontend/shared-contract cleanup.
4. Database/migration hygiene.
5. CI/test/lint hardening.
6. Documentation and runbook alignment.

## Workstream Checklist

### A) Baseline and Inventory

- [ ] Create dedicated cleanup branch and capture baseline commit hash.
- [x] Capture baseline quality metrics: `pytest`, Next typecheck/build, lint, migration sanity.
- [x] Inventory duplicate or deprecated paths (API routes, UI components, shared schemas, scripts).
- [x] Freeze temporary artifacts list to delete after verification.
- [x] Batch A1: make frontend lint runner non-interactive and define ignore rules for temp/recovery artifacts.
- [x] Batch A4 (part 1): route Hardhat cache to repo-local path to avoid Windows `LOCALAPPDATA` permission failures.

Baseline evidence:

1. `docs/re-architecture-core/14-cleanup-baseline-inventory.md`
2. Baseline commit captured: `ef5441e` on branch `recovery-2026-04-17`

### B) API and Service Layer

- [x] Consolidate duplicate DTO/response schema definitions.
- [x] Remove deprecated facade fallback paths no longer needed by active flows.
- [x] Standardize error mapping and response envelope behavior.
- [ ] Refactor large handlers into smaller service functions where complexity is high.
- [ ] Add/update tests for every refactor hotspot before removal.
- [x] Batch B1 (part 1): consolidate reservation policy metadata DTO/shared-type definitions and remove repeated route mapping blocks.
- [x] Batch B1 (part 2): centralize reservation update/fallback helpers in Supabase integration and remove repeated policy metadata persistence logic in operations route.
- [x] Batch B2 (part 1): centralize RuntimeError->HTTP status mapping helper and apply it across reservations/payments/operations routes with regression tests.
- [x] Batch B2 (part 2): add unified API HTTP exception envelope (`detail`, `code`, `context`) for v2 routes and cover with contract tests.
- [x] Batch B3 (part 1): refactor stay reservation and walk-in route handlers into shared helper functions (validation, availability, pricing, note composition) to reduce handler complexity.
- [x] Batch B3 (part 2): refactor tour reservation handler flow into shared helper functions (input validation, active-service resolution, total computation, source resolution).
- [x] Batch B3 (part 3): refactor cancellation/status side-effect flow into shared helpers (reservation fetch, cancellable guard, policy/escrow side-effects, cancel response builder).
- [x] Batch B4 (part 1): centralize idempotency operation-id generation in shared service helper and remove duplicated hashing helpers across v2 routes.
- [x] Batch B4 (part 2): centralize idempotency receipt load/store safe wrappers and remove repeated replay/store try-catch blocks in payments/operations/guest-services routes.
- [x] Batch B4 (part 3): migrate reservations route idempotency replay/store flow to shared idempotency receipt helpers for full v2 route consistency.
- [x] Batch B5 (part 1): move route-local auth/qr/payments/check-operation request-response DTOs into `app.schemas.common` to reduce schema duplication across v2 route modules.
- [x] Batch B5 (part 2): remove legacy missing-column fallback select branches in Supabase reservation/payment list facades now that split migrations and repeated `db:reset` validation are stable.
- [x] Batch B5 (part 3): move remaining route-local AI/NFT DTOs into `app.schemas.common`, eliminating in-route Pydantic model duplication across v2 modules.
- [x] Batch B6 (part 1): extract AI route forecast/concierge normalization helpers and add targeted helper tests to reduce duplicated parsing/normalization logic.
- [x] Batch B6 (part 2): add AI route contract regressions for occupancy/concierge normalization to protect persistence and response-shape behavior.

### C) Frontend and Shared Contracts

- [ ] Align all data contracts with `packages/shared` as source of truth.
- [ ] Remove duplicate client-side type definitions superseded by shared schemas.
- [ ] Normalize API fetch wrappers and error handling across admin/guest modules.
- [ ] Remove dead components/routes and obsolete compatibility redirects.
- [ ] Re-run end-to-end manual smoke for reservation, payment, QR, blockchain, AI, sync pages.
- [x] Batch A3: consolidate legacy admin compatibility redirects from page files into `next.config.ts` redirects.
- [x] Batch C1 (part 1): unify reservation policy enum constants in shared package and align cancellation outcome handling in `MyBookingsClient`.
- [x] Batch C1 (part 2): centralize stay deposit preview logic in shared contracts and reuse in booking/cancellation UI messaging.
- [x] Batch C2 (part 1): centralize server-rendered admin page API bootstrap fetch + schema-parse flow via shared `serverApi` helper and migrate core admin screens.
- [x] Batch C2 (part 2): extend shared `serverApi` bootstrap usage to guest/public SSR pages (bookings, tours, my-stay) and admin walk-in preloads for consistent fetch/error handling.
- [x] Batch C2 (part 3): add shared client-side API error normalizer and adopt it across high-traffic booking/operations clients to unify user-facing API/network failure messaging.
- [x] Batch C2 (part 4): expand shared client-side API error normalizer adoption across admin reservations/payments/units clients and align auth/network fallback messaging.
- [x] Batch C2 (part 5): expand shared client-side API error normalizer adoption across admin AI center and room-management dashboard flows.
- [x] Batch C2 (part 6): expand shared client-side API error normalizer adoption across admin check-in validation/sync/checkout failure flows.
- [x] Batch C2 (part 7): expand shared client-side API error normalizer adoption across guest profile/stay/wallet interaction flows.
- [x] Batch C2 (part 8): expand shared client-side API error normalizer adoption across guest bookings list/details/payment/cancel/QR flows.
- [x] Batch C2 (part 9): expand shared client-side API error normalizer adoption across auth entrypoints and shared unit-photo upload utility.
- [x] Batch C2 (part 10): remove remaining ad-hoc `instanceof Error` fallback branches in check-in and booking edge handlers using shared/normalized error text flow.
- [x] Batch C2 (part 11): adopt `safeGetSession` in `SessionAndApiStatus` to avoid direct auth session-read failures and keep status widget behavior consistent with hardened auth clients.
- [x] Batch C2 (part 12): centralize auth session-cookie POST/DELETE helpers and remove repeated `/api/auth/session` fetch blocks from login/register and admin/guest logout flows.
- [x] Batch C2 (part 13): centralize repeated user display/profile-name fallback logic in shared `userProfile` helper and reuse in login + guest/admin shells.
- [x] Batch C3 (part 1): move admin AI center forecast/concierge/apply response contracts into `packages/shared` and remove local duplicate Zod/type definitions.
- [x] Batch C3 (part 2): move QR public-key response contract into `packages/shared` and remove admin check-in inline response typing.
- [x] Batch C3 (part 3): move API health response contract into `packages/shared` and replace local status widget typing with shared schema/type parsing.
- [x] Batch C3 (part 4): move guest map amenity pack contract into `packages/shared` and remove local amenity-pin type/normalization duplication.
- [x] Batch C3 (part 5): move guest pass verification response contract into `packages/shared` and remove guest-stay page local schema duplication.
- [x] Batch C4 (part 1): standardize admin check-in/escrow loading placeholders to shared `Skeleton` component for consistent loading-state primitives.
- [x] Batch C4 (part 13): add shared chain-explorer helper utilities and replace duplicated tx/token-link + hash formatting logic in guest stay and admin escrow/audit screens.
- [x] Batch C4 (part 14): expand shared date-display helper usage across admin escrow/reconciliation/audit and sync-center views, removing repeated local date-format helpers.
- [x] Batch C4 (part 15): centralize explorer-base tx URL/hash normalization and remove remaining admin blockchain/dashboard duplicate hash/date helpers.
- [x] Batch C4 (part 16): remove remaining date-format helper duplication in admin reservations/payments/dashboard + AI insight surfaces by reusing shared `dateDisplay` and explorer helpers.
- [x] Batch C4 (part 17): migrate admin check-in timezone-aware inline timestamps to shared `dateDisplay` formatting options to remove the last route-local date/time formatter duplication in check-in flows.
- [x] Batch C4 (part 18): expand shared `dateDisplay` adoption to admin services, AI center freshness labels, escrow timestamp summaries, and reports header refresh stamp.
- [x] Batch C4 (part 19): add shared `formatDateOnly(...)` helper and replace remaining repeated date-only formatter blocks across admin reservations/check-in/reports/resource-heatmap surfaces.
- [x] Batch C4 (part 20): align guest my-bookings date rendering with shared `formatDateOnly(...)` helper to remove the last guest-local ISO date display formatter duplication.
- [x] Batch C4 (part 21): eliminate remaining local PHP currency formatter duplication by reusing shared `formatCurrency` helper across guest stay and admin services/walk-in/reservations/payments/check-in/AI/dashboard/reports surfaces.
- [x] Batch C4 (part 22): replace duplicated local “today/tomorrow ISO date” builders in admin walk-in and reports flows with shared `dateIso` helpers.
- [x] Batch C4 (part 23): consolidate duplicated reservation-source/payment-state and proof-path normalization helpers into shared utility modules for admin reservations/payments flows.
- [x] Batch C4 (part 24): add shared date-display presets (`formatDateWithYear`, `formatDateWithWeekday`) and remove remaining local wrapper functions in admin reservations/check-in and guest bookings views.
- [x] Batch C4 (part 25): centralize reservation status badge metadata into shared helper and remove duplicated status-class maps/functions across admin reservations/payments and guest bookings views.
- [x] Batch C4 (part 26): keep guest booking gallery trigger available when unit cards exist (even without image seed) so modal-accessibility guardrails validate dialog semantics against real booking cards.

### D) Database and Migration Hygiene

- [x] Standardize migration naming format and ordering consistency.
- [x] Remove temporary/recovery files from tracked project scope.
- [x] Ensure `supabase db reset` and repository migration sanity checks pass cleanly.
- [x] Verify function/policy/trigger definitions are idempotent and parser-safe.
- [x] Update migration notes with rationale for any split or reordering.
- [x] Batch A2: add automated migration hygiene check with explicit waiver tracking for legacy filename/duplicate pair.
- [x] Batch D1 (part 1): add a single `db:validate` workflow (`db:sanity` + `db:hygiene`) and re-verify migration checks on current rename/split set.
- [x] Batch D1 (part 2): document 2026-04-18 migration split/reorder rationale and parser-safety sequencing.
- [x] Batch D2 (part 1): untrack `supabase/.temp/cli-latest` so Supabase temp state no longer pollutes repository diffs.
- [x] Batch D2 (part 2): remove legacy underscore-index migration duplicates and add split `20260418001..20260418009` policy rollout migrations.
- [x] Batch D3 (part 1): remove legacy duplicate waiver migration (`20260218_002_*`) and enforce zero-waiver canonical naming/duplicate hygiene baseline.

### E) CI, Lint, and Test Hardening

- [ ] Keep CI release gate green after each cleanup batch.
- [ ] Enforce strict lint/type rules on touched modules.
- [ ] Add missing regression tests for previous production incidents.
- [ ] Remove flaky or redundant tests and replace with deterministic coverage.
- [ ] Publish a final quality report snapshot in `docs/re-architecture-core/perf-report.md`.
- [x] Batch E1 (part 1): replace deprecated `HTTP_422_UNPROCESSABLE_ENTITY` usage with `HTTP_422_UNPROCESSABLE_CONTENT` across v2 API routes to reduce warning noise in test runs.
- [x] Batch E1 (part 2): migrate FastAPI app lifecycle from `@app.on_event` to lifespan context management and remove startup/shutdown deprecation warnings.
- [x] Batch E1 (part 3): disable pytest cache provider in API test runs to remove persistent Windows cache-permission warning noise.
- [x] Batch E2 (part 1): clear API Ruff baseline violations in touched modules (`qr.py`, `supabase_client.py`) and verify lint + tests stay green.
- [x] Batch E2 (part 2): harden monorepo lint script to call Ruff through API venv Python so `npm run lint` works consistently on Windows shells.
- [x] Batch E2 (part 3): clear frontend ESLint warning backlog (hooks deps + intentional `img` rule suppressions for current landing/map assets) and re-verify lint/typecheck.
- [x] Batch E3 (part 1): refresh frontend baseline-browser data dependency to remove stale Baseline notice from lint output.
- [x] Batch E4 (part 1): add a consolidated `quality:gate` command to run lint/typecheck/API tests/migration validation together and verify it passes.
- [x] Batch E4 (part 2): make API Python runner scripts cross-platform (`.venv` autodetect + `python` fallback) so quality gates are reusable on Linux CI and Windows dev.
- [x] Batch E5 (part 1): refresh `docs/re-architecture-core/perf-report.md` with the latest cleanup quality-gate snapshot (`lint`, `typecheck`, `test:api`, `db:validate`).
- [x] Batch E6 (part 1): harden guest Playwright guardrails for auth-gated routes and optional modal keyboard checks (credential-aware skip + stable auth-gate assertions).
- [x] Batch E6 (part 2): stabilize guest modal guardrail login flow (hydration-safe credential input + explicit timeout budget) and clarify skip reason when no available unit cards are seeded.
- [x] Batch E6 (part 3): centralize guest route auth-gate resolution polling helper across smoke/a11y suites to reduce flaky duplicated checks in `/guest/services`, `/my-bookings`, and `/guest/sync` coverage.

### F) Documentation Alignment

- [ ] Update architecture, checklist, and status docs to reflect final cleaned state.
- [ ] Update developer runbook commands and local dev troubleshooting notes.
- [ ] Record removed modules/files and migration implications.
- [ ] Attach final acceptance evidence links (CI run, smoke output, key screenshots).
- [x] Batch F1 (part 1): align policy rollout runbook with split migration sequence and `db:validate` preflight.
- [x] Batch F2 (part 1): sync cleanup status docs (`10-next-gap-closure-plan`, `13-cleanup-refactor-checklist`, `14-cleanup-baseline-inventory`) with current completed batches and remaining acceptance evidence.
- [x] Batch F3 (part 1): align guest acceptance and automation docs with current G8 state (`9 passed`, `1 skipped` optional modal auth guardrail) and manual matrix completion evidence.
- [x] Batch F4 (part 1): refresh root `README.md` run commands for current workflow (`db:start`, `test:guest:e2e`, `quality:gate`, optional guest E2E credentials).

## Definition of Done

1. No known duplicate schema/type sources for active modules.
2. No obsolete compatibility code in active production path.
3. `db reset`, API tests, contracts build, Next build/typecheck, and CI gate all pass.
4. Core docs and operational runbooks match actual runtime behavior.
5. Cleanup outcomes are captured in this checklist and linked from phase plan/status docs.

## Suggested Commit Batching

1. `chore(cleanup): baseline and inventory`
2. `refactor(api): consolidate schemas and remove deprecated paths`
3. `refactor(frontend): align contracts and remove dead code`
4. `chore(db): migration hygiene and idempotency cleanup`
5. `chore(ci): harden lint/test gates`
6. `docs(cleanup): finalize status and evidence`
