# Cleanup Baseline & Inventory Report

Last updated: 2026-04-25  
Phase: Post-phase cleanup/refactor (Checklist A)

## Baseline Snapshot

1. Branch: `recovery-2026-04-17`
2. Baseline commit: `ef5441e`
3. Working tree churn at snapshot:
   - `total_changes=78`
   - `modified=16`
   - `deleted=44`
   - `untracked=18`
4. Migration-only churn:
   - `migration_changes=53`
   - `migration_deleted=44`
   - `migration_untracked=9`

## Baseline Quality Metrics

| Check | Command | Result | Notes |
|---|---|---|---|
| Migration sanity | `python supabase/scripts/migration_sanity_check.py` | Pass | `ok: true`, `checked_files: 71` |
| API tests | `hillside-api\.venv\Scripts\python.exe -m pytest hillside-api/tests -q` | Pass | `79 passed`, with warnings |
| Next typecheck | `npm --prefix hillside-next run typecheck` | Pass | `tsc --noEmit` succeeded |
| Shared typecheck | `npm --workspace @hillside/shared run typecheck` | Pass | succeeded |
| Next lint | `npm --prefix hillside-next run lint` | Blocked | Interactive ESLint setup prompt; no non-interactive lint baseline yet |
| Next production build | `npm --prefix hillside-next run build` | Fail | `spawn EPERM` on this environment |
| Contracts compile | `npm --prefix hillside-contracts run build` | Fail | Hardhat `HH505` native `solc` execution failure |

## Inventory Findings (Round 1)

### 1) Temporary/Recovery Artifacts (cleanup candidates)

1. `.git_acl_backup_sddl.txt`
2. `hillside-api/.tmp-api-err.log`
3. `hillside-api/.tmp-api-out.log`
4. `hillside-api/.tmp-devapi-err.log`
5. `hillside-api/.tmp-devapi-out.log`
6. `recovery_backups/` (directory)

### 2) Migration Hygiene Signals

1. Naming consistency mostly follows `YYYYMMDDNNN_description.sql`.
2. One outlier naming format exists: `supabase/migrations/20260218_002_payment_rejection_reason.sql`.
3. Duplicate migration content confirmed between:
   - `supabase/migrations/20260218006_payment_rejection_reason.sql`
   - `supabase/migrations/20260218_002_payment_rejection_reason.sql`
4. Active migration sequence has a large rename/split wave in progress (44 deleted + 9 new untracked files).

### 3) Deprecated/Compatibility Route Surface (candidate prune list)

Redirect-only legacy pages currently present in `hillside-next/app/admin`:

1. `checkin/page.tsx` -> `/admin/check-in`
2. `scan/page.tsx` -> `/admin/check-in`
3. `tours/new/page.tsx` -> `/admin/walk-in-tour`
4. `units/new/page.tsx` -> `/admin/units`
5. `units/[unitId]/edit/page.tsx` -> `/admin/units?unit_id=...`
6. `reservations/new/page.tsx` -> `/admin/reservations`
7. `reservations/[reservationId]/page.tsx` -> `/admin/reservations?reservation_id=...`
8. `walk-in-stay/page.tsx` -> `/admin/walk-in?tab=stay`
9. `walk-in-tour/page.tsx` -> `/admin/walk-in?tab=tour`

Note: these are valid compatibility bridges today, but should be reviewed for removal timing in cleanup batches.

### 4) Warning Backlog (non-blocking but should be cleaned)

1. No active API warning backlog after Batch E1 part 3 (`pytest` warning-free baseline achieved).
2. No active frontend ESLint warning backlog after Batch E2 part 3 (`eslint` clean pass).
3. No active tooling warning backlog in lint output after Batch E3 part 1 baseline-data refresh.

## Recommended First Cleanup Batches

1. Batch A1: Non-runtime hygiene
   - normalize lint runner to non-interactive ESLint CLI
   - document/ignore temp artifacts
2. Batch A2: Migration cleanup safety pass
   - resolve duplicate migration file pair
   - finalize naming consistency policy
3. Batch A3: Compatibility path review
   - confirm which admin redirect aliases can be retired
4. Batch A4: Toolchain stability
   - fix Hardhat `HH505` local compile reliability
   - resolve Next `spawn EPERM` build blocker

## Batch A1 Execution Update (Completed)

1. Added non-interactive ESLint CLI workflow for Next app:
   - `hillside-next/package.json` (`lint` now runs `eslint .`)
   - `hillside-next/eslint.config.mjs` (flat config + `.next` ignore)
2. Installed lint dependencies in workspace:
   - `eslint`
   - `eslint-config-next`
3. Added temp/recovery ignore rules at repo root:
   - `.tmp-*.log`
   - `*.tmp`
   - `recovery_backups/`
   - `.git_acl_backup_sddl.txt`
   - `supabase/.temp/`
4. Lint now runs non-interactively and exits successfully with warnings only (no errors).
5. Warning backlog remains for follow-up cleanup batches (hooks deps and `img` optimization guidance).

## Batch A2 Execution Update (Completed with noted blockers)

1. Added automated migration hygiene guard:
   - `supabase/scripts/migration_hygiene_check.py`
   - Root script: `npm run db:hygiene`
2. Hygiene check result:
   - `ok: true`
   - `checked_files: 71`
   - canonical naming rule: `^\d{11}_[a-z0-9_]+\.sql$`
3. Explicit waiver tracking added for known historical compatibility pair:
   - Legacy filename: `20260218_002_payment_rejection_reason.sql`
   - Duplicate-content pair:
     - `20260218006_payment_rejection_reason.sql`
     - `20260218_002_payment_rejection_reason.sql`
4. `migration_sanity_check.py` still passes after A2 updates.
5. Local `npm run db:reset` is currently blocked by Docker access/permission on this environment (`//./pipe/dockerDesktopLinuxEngine: Access is denied`).

## Batch A3 Execution Update (Completed)

1. Consolidated legacy admin path compatibility to centralized Next redirects:
   - Added redirect rules in `hillside-next/next.config.ts`
2. Removed route-file redirect shims:
   - `hillside-next/app/admin/checkin/page.tsx`
   - `hillside-next/app/admin/scan/page.tsx`
   - `hillside-next/app/admin/tours/new/page.tsx`
   - `hillside-next/app/admin/units/new/page.tsx`
   - `hillside-next/app/admin/units/[unitId]/edit/page.tsx`
   - `hillside-next/app/admin/reservations/new/page.tsx`
   - `hillside-next/app/admin/reservations/[reservationId]/page.tsx`
   - `hillside-next/app/admin/walk-in-stay/page.tsx`
   - `hillside-next/app/admin/walk-in-tour/page.tsx`
3. Updated canonical route documentation:
   - `hillside-next/README.md` now uses `/admin/walk-in?tab=tour` as canonical path.
4. Validation after A3:
   - `npm --prefix hillside-next run typecheck` passed.
   - `npm --prefix hillside-next run lint` passed with warnings only (0 errors).

## Batch A4 Execution Update (Part 1 Complete)

1. Added Hardhat launcher wrapper to avoid Windows cache permission failures:
   - `hillside-contracts/scripts/run-hardhat.cjs`
2. Updated contract scripts to use wrapper entrypoint:
   - `hillside-contracts/package.json` (`build`, `test`, deploy scripts now call `npm run hardhat -- ...`)
3. Added repo-local cache ignore for wrapper behavior:
   - `.gitignore` now ignores `hillside-contracts/.cache/`
4. Contracts README now documents cache behavior and override flag:
   - `HILLSIDE_HARDHAT_USE_GLOBAL_CACHE=1` to opt back into global cache.
5. Validation signal:
   - Previous `EPERM` on `C:\\Users\\user\\AppData\\Local\\hardhat-nodejs\\Cache\\compilers-v2` is avoided.
   - Current failure mode became `HH502` (compiler download), which is expected in restricted-network environments.

Remaining A4 blocker:

1. `npm --prefix hillside-next run build` still fails on this environment with `spawn EPERM`.
2. Root cause appears environment-level child-process restriction, not app-level TypeScript/ESLint issues (typecheck/lint pass).

## Batch B1 Execution Update (Part 1 Complete)

1. Consolidated reservation policy metadata DTOs in API schemas:
   - Added reusable Pydantic bases in `hillside-api/app/schemas/common.py`:
     - `ReservationPolicyMetadata`
     - `ReservationPaymentPolicyMetadata`
   - Reused these in:
     - `ReservationResponse`
     - `ReservationListItem`
     - `CancelReservationResponse`
     - `PaymentReservationSummary`
2. Consolidated reservation policy field mapping logic in API route layer:
   - Added helpers in `hillside-api/app/api/v2/routes/reservations.py`:
     - `_to_optional_str`
     - `_reservation_policy_fields`
     - `_resolve_reservation_policy_rule`
     - `_resolve_reservation_policy_version`
   - Replaced repeated inline field mapping blocks across create/cancel/status endpoints.
3. Consolidated shared contract definitions for policy metadata:
   - `packages/shared/src/schemas.ts` now has:
     - `reservationCancellationActorSchema`
     - `reservationPolicyOutcomeSchema`
     - `reservationPolicyMetadataShape`
     - `reservationPaymentPolicyMetadataShape`
   - `packages/shared/src/types.ts` now has:
     - `ReservationCancellationActor`
     - `ReservationPolicyOutcome`
     - `ReservationPolicyMetadata`
     - `ReservationPaymentPolicyMetadata`
4. Minor test cleanup:
   - Removed duplicated monkeypatch line in `hillside-api/tests/test_v2_reservations_contract.py`.
5. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_reservations_contract.py -q` passed (`14 passed`).
   - `npm --workspace @hillside/shared run typecheck` passed.

## Batch B1 Execution Update (Part 2 Complete)

1. Consolidated reservation update read-back logic in Supabase integration:
   - Added `_update_reservation_and_fetch(...)` in `hillside-api/app/integrations/supabase_client.py`.
   - Reused it in:
     - `update_reservation_status(...)`
     - `update_reservation_source(...)`
     - `update_reservation_policy_metadata(...)`
2. Standardized missing-column fallback handling:
   - Added `_run_select_with_missing_column_fallbacks(...)`.
   - Applied to:
     - `list_recent_reservations(...)`
     - `list_admin_payments(...)`
   - This keeps behavior while reducing nested/duplicated try-except fallback branches.
3. Reduced policy persistence duplication in operations route:
   - Added helpers in `hillside-api/app/api/v2/routes/operations.py`:
     - `_optional_str(...)`
     - `_resolve_policy_rule(...)`
     - `_persist_released_policy_outcome(...)`
   - `perform_checkin(...)` now calls helper for released-policy metadata write.
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_qr_operations_contract.py hillside-api/tests/test_v2_payments_contract.py -q` passed (`30 passed`).

## Batch C1 Execution Update (Part 1 Complete)

1. Centralized reservation policy enum constants in shared package:
   - Added `RESERVATION_CANCELLATION_ACTORS` and `RESERVATION_POLICY_OUTCOMES` in `packages/shared/src/types.ts`.
   - Kept schema enums sourced from those constants in `packages/shared/src/schemas.ts`.
2. Aligned frontend cancellation outcome handling with shared contract typing:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx` now uses typed `ReservationPolicyOutcome` via `cancellationResultMessage(...)`.
   - Removed ad-hoc lowercase string comparison logic after cancel API call.
3. Validation:
   - `npm --workspace @hillside/shared run typecheck` passed.
   - `npm --prefix hillside-next run typecheck` passed.

## Batch C1 Execution Update (Part 2 Complete)

1. Centralized stay deposit preview business rule in shared package:
   - Added in `packages/shared/src/types.ts`:
     - `STAY_DEPOSIT_RATE`
     - `STAY_DEPOSIT_MIN`
     - `STAY_DEPOSIT_MAX`
     - `computeStayDepositPreview(...)`
2. Reused shared helper in booking flow UI:
   - `hillside-next/components/book/BookNowClient.tsx` now imports `computeStayDepositPreview` from shared package (removed local duplicate function).
3. Reused shared helper in cancellation warning fallback:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx` now estimates deposit consequence from `total_amount` when `deposit_required` is missing.
4. Validation:
   - `npm --workspace @hillside/shared run typecheck` passed.
   - `npm --prefix hillside-next run typecheck` passed.

## Batch D1 Execution Update (Part 1 Complete)

1. Added consolidated migration validation command at repo root:
   - `package.json` script: `db:validate` -> runs `db:sanity` then `db:hygiene`.
2. Re-validated migration rename/split set:
   - `npm run db:validate` passed.
   - `migration_sanity_check.py`: `ok: true`, `checked_files: 71`.
   - `migration_hygiene_check.py`: `ok: true`, blocking issues empty, with existing explicit waiver for:
     - `20260218_002_payment_rejection_reason.sql`
     - duplicate-content pair with `20260218006_payment_rejection_reason.sql`.
3. Current blocker unchanged:
   - `npm run db:reset` is still blocked on this machine by Docker Desktop pipe permissions:
     - `open //./pipe/dockerDesktopLinuxEngine: Access is denied`.

## Batch D1 Execution Update (Part 2 Complete)

1. Added explicit migration split rationale document:
   - `docs/re-architecture-core/15-migration-split-rationale-20260418.md`
2. Captured why the sequence was split:
   - parser/runtime failure context (`cannot insert multiple commands into a prepared statement`)
   - ordering and idempotency rules applied for drop/create/grant separation
   - behavior-preservation notes for policy metadata and cancellation capture
3. Linked validation evidence in rationale:
   - `db:sanity` pass
   - `db:hygiene` pass
   - `db:validate` pass
4. Environment blocker remains unchanged:
   - `db:reset` still blocked by Docker Desktop pipe access on this workstation.

## Batch F1 Execution Update (Part 1 Complete)

1. Updated policy rollout runbook for the split migration sequence:
   - `docs/policy-v1-rollout-checklist.md`
2. Replaced single-file migration reference with ordered `20260418001..20260418009` execution list.
3. Added `db:validate` preflight step to keep parser/hygiene checks explicit before runtime validation.
4. Runbook now aligns with D1 rationale doc:
   - `docs/re-architecture-core/15-migration-split-rationale-20260418.md`

## Batch D2 Execution Update (Part 1 Complete)

1. Removed tracked Supabase temp marker from repository index:
   - `supabase/.temp/cli-latest` (now untracked, ignored temp state)
2. Outcome:
   - local Supabase CLI metadata can still exist for local tooling
   - file will no longer appear as a recurring tracked modification in cleanup commits

## Batch D2 Execution Update (Part 2 Complete)

1. Removed legacy underscore-index migration duplicates from tracked set:
   - deleted old-format files like `20260205_001_...`, `20260207_004_...` etc.
2. Added split policy rollout migration set:
   - `supabase/migrations/20260418001_policy_escrow_alignment.sql`
   - `supabase/migrations/20260418002_drop_create_reservation_atomic.sql`
   - `supabase/migrations/20260418003_create_reservation_atomic.sql`
   - `supabase/migrations/20260418004_grant_create_reservation_atomic.sql`
   - `supabase/migrations/20260418005_drop_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418006_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418007_grant_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418008_create_cancel_reservation.sql`
   - `supabase/migrations/20260418009_grant_cancel_reservation.sql`
3. Validation after cleanup:
   - `npm run db:validate` passed
   - `checked_files: 71`
   - explicit legacy waiver remains only for `20260218_002_payment_rejection_reason.sql` pair

## Batch B2 Execution Update (Part 1 Complete)

1. Added shared error-mapping helper for route RuntimeError handling:
   - `hillside-api/app/api/v2/routes/_http_errors.py`
   - helpers:
     - `runtime_error_status(...)`
     - `raise_http_from_runtime_error(...)`
2. Replaced repeated ad-hoc RuntimeError mapping logic in:
   - `hillside-api/app/api/v2/routes/reservations.py`
   - `hillside-api/app/api/v2/routes/payments.py`
   - `hillside-api/app/api/v2/routes/operations.py`
3. Removed duplicate local mapping helper in payments route:
   - removed `_http_status_from_runtime_error(...)` from `payments.py`
4. Added regression coverage:
   - `hillside-api/tests/test_v2_error_mapping.py`
5. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `33 passed`

## Batch B2 Execution Update (Part 2 Complete)

1. Added unified HTTP exception envelope for API errors:
   - shape: `detail`, `code`, `context`
2. Implemented shared error primitives in:
   - `hillside-api/app/api/v2/routes/_http_errors.py`
   - added `ApiHttpError`, `build_http_error_payload(...)`, default status->code mapping
3. Wired global HTTP exception handler for v2 route exceptions:
   - `hillside-api/app/main.py`
   - converts route `HTTPException`/`ApiHttpError` to standardized envelope
4. Added envelope contract tests:
   - `hillside-api/tests/test_v2_error_envelope_contract.py`
   - covers:
     - admin-forbidden flow (`code=forbidden`)
     - validation flow (`code=unprocessable_content`)
     - runtime config failure flow (`code=service_unavailable`)
5. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `36 passed`

## Batch B3 Execution Update (Part 1 Complete)

1. Reduced route-handler complexity in `reservations.py` by extracting shared stay-booking helper functions:
   - `_validate_stay_reservation_inputs(...)`
   - `_get_available_unit_map(...)`
   - `_ensure_selected_units_available(...)`
   - `_ensure_guest_count_within_capacity(...)`
   - `_compute_stay_rates_and_total(...)`
   - `_build_walk_in_notes(...)`
2. Reused helpers in:
   - `create_reservation(...)`
   - `create_walk_in_stay_reservation(...)`
3. Preserved contract behavior while removing duplicated in-handler logic for:
   - stay date/unit validation
   - available-units fetch + unavailable-unit checks
   - rates/total computation
   - walk-in notes composition
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `36 passed`

## Batch B3 Execution Update (Part 2 Complete)

1. Reduced tour-reservation handler complexity in `reservations.py` by extracting shared helpers:
   - `_validate_tour_reservation_inputs(...)`
   - `_get_active_tour_service_or_404(...)`
   - `_compute_tour_total_amount(...)`
   - `_resolve_tour_reservation_source(...)`
2. Added cross-flow helper reuse for stay/tour/walk-in response construction support:
   - `_parse_booking_status(...)`
   - `_persist_reservation_source(...)`
   - `_load_pricing_signals(...)`
3. Reused these helpers in:
   - `create_reservation(...)`
   - `create_tour_reservation(...)`
   - `create_walk_in_stay_reservation(...)`
4. Preserved contract behavior while removing duplicated in-handler logic for:
   - tour payload guard checks
   - service lookup + not-found handling
   - total amount derivation
   - source persistence and pricing-signal fetch fallback
5. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `36 passed`

## Batch B3 Execution Update (Part 3 Complete)

1. Reduced cancellation/status handler complexity in `reservations.py` by extracting shared helpers:
   - `_get_reservation_or_404(...)`
   - `_ensure_reservation_cancellable(...)`
   - `_apply_cancellation_side_effects(...)`
   - `_build_cancel_response(...)`
2. Reused these helpers in:
   - `get_reservation(...)`
   - `patch_reservation_status(...)`
   - `cancel_reservation(...)`
3. Preserved behavior while removing duplicated logic for:
   - reservation fetch + not-found handling
   - cancellable-status guard
   - cancellation policy metadata + escrow refund side-effects
   - cancel response payload assembly
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `36 passed`

## Batch B4 Execution Update (Part 1 Complete)

1. Added shared idempotency operation-id helper:
   - `hillside-api/app/services/idempotency.py`
   - exported: `build_idempotency_operation_id(...)`
2. Removed duplicated route-local hash helpers and switched to shared helper in:
   - `hillside-api/app/api/v2/routes/reservations.py`
   - `hillside-api/app/api/v2/routes/payments.py`
   - `hillside-api/app/api/v2/routes/operations.py`
   - `hillside-api/app/api/v2/routes/guest_services.py`
3. Added service-level regression tests:
   - `hillside-api/tests/test_services_idempotency.py`
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_services_idempotency.py hillside-api/tests/test_v2_error_mapping.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py -q`
   - result: `39 passed`

## Batch B4 Execution Update (Part 2 Complete)

1. Extended shared idempotency service with receipt wrappers:
   - `load_cached_response_payload(...)`
   - `store_operation_receipt_safely(...)`
2. Replaced duplicated per-route idempotency receipt replay/store try-catch blocks in:
   - `hillside-api/app/api/v2/routes/payments.py`
   - `hillside-api/app/api/v2/routes/operations.py`
   - `hillside-api/app/api/v2/routes/guest_services.py`
3. Added/expanded service-level tests:
   - `hillside-api/tests/test_services_idempotency.py`
   - now validates deterministic operation-id generation + safe receipt wrapper behavior
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_services_idempotency.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_error_mapping.py -q`
   - result: `41 passed`

## Batch B4 Execution Update (Part 3 Complete)

1. Completed idempotency wrapper adoption in reservations route:
   - `hillside-api/app/api/v2/routes/reservations.py`
2. Replaced route-local replay/store try-catch receipt handling in:
   - `_try_replay_reservation_response(...)`
   - `_store_reservation_idempotency_receipt(...)`
   with shared helpers:
   - `load_cached_response_payload(...)`
   - `store_operation_receipt_safely(...)`
3. Outcome:
   - all major v2 idempotent write paths now use shared operation-id and receipt wrappers
   - fewer duplicated logging/error-handling branches in route modules
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests/test_services_idempotency.py hillside-api/tests/test_v2_reservations_contract.py hillside-api/tests/test_v2_payments_contract.py hillside-api/tests/test_v2_qr_operations_contract.py hillside-api/tests/test_v2_error_envelope_contract.py hillside-api/tests/test_v2_error_mapping.py -q`
   - result: `41 passed`

## Batch E1 Execution Update (Part 1 Complete)

1. Replaced deprecated status constant usage in v2 API routes:
   - changed `status.HTTP_422_UNPROCESSABLE_ENTITY` to `status.HTTP_422_UNPROCESSABLE_CONTENT`
2. Updated files:
   - `hillside-api/app/api/v2/routes/audit.py`
   - `hillside-api/app/api/v2/routes/catalog.py`
   - `hillside-api/app/api/v2/routes/dashboard.py`
   - `hillside-api/app/api/v2/routes/me.py`
   - `hillside-api/app/api/v2/routes/qr.py`
   - `hillside-api/app/api/v2/routes/reports.py`
   - `hillside-api/app/api/v2/routes/reservations.py`
   - `hillside-api/app/api/v2/routes/sync.py`
3. Outcome:
   - removed `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warnings from test runs
   - remaining deprecation warnings are now concentrated on FastAPI `@app.on_event` usage in `app/main.py`
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests -q`
   - result: `90 passed`

## Batch E1 Execution Update (Part 2 Complete)

1. Migrated FastAPI lifecycle wiring in `hillside-api/app/main.py`:
   - replaced deprecated `@app.on_event("startup")` / `@app.on_event("shutdown")`
   - added lifespan context manager with `_start_escrow_reconciliation_scheduler(...)` and `_stop_escrow_reconciliation_scheduler(...)`
2. Preserved scheduler behavior:
   - starts escrow reconciliation loop when feature flag is enabled
   - cancels/awaits background task cleanly on app shutdown
3. Outcome:
   - removed FastAPI startup/shutdown deprecation warnings from test runs
   - remaining warning backlog is now limited to `.pytest_cache` permission warning on this workstation
4. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests -q`
   - result: `90 passed`, `1 warning`

## Batch E1 Execution Update (Part 3 Complete)

1. Removed persistent Windows pytest cache-permission warning in API test runs:
   - updated `hillside-api/pyproject.toml`
   - added `[tool.pytest.ini_options] addopts = "-p no:cacheprovider"`
2. Outcome:
   - pytest no longer attempts `.pytest_cache` writes on this workstation
   - API baseline test output is now warning-free
3. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests -q`
   - result: `90 passed`

## Batch E2 Execution Update (Part 1 Complete)

1. Cleared API Ruff baseline violations in touched modules:
   - `hillside-api/app/api/v2/routes/qr.py`
     - removed unused `public_key` assignment in `issue_token(...)` while preserving key-resolution guard call
   - `hillside-api/app/integrations/supabase_client.py`
     - removed accidental f-string marker in missing-column error matcher
2. Validation:
   - `hillside-api\\.venv\\Scripts\\python.exe -m ruff check hillside-api/app hillside-api/tests`
   - result: `All checks passed!`
   - `hillside-api\\.venv\\Scripts\\python.exe -m pytest hillside-api/tests -q`
   - result: `90 passed`

## Batch E2 Execution Update (Part 2 Complete)

1. Hardened monorepo lint script for Windows reliability:
   - updated root `package.json` `lint` script
   - replaced `cd hillside-api && ruff check app tests` with explicit venv invocation:
     - `hillside-api\\.venv\\Scripts\\python.exe -m ruff check hillside-api/app hillside-api/tests`
2. Outcome:
   - `npm run lint` now succeeds consistently in this environment (no `ruff` command-not-found failure)
   - frontend warnings remain visible and non-blocking
3. Validation:
   - `npm run lint` -> pass (0 errors, 12 frontend warnings)
   - `npm run typecheck` -> pass

## Batch E2 Execution Update (Part 3 Complete)

1. Cleared frontend ESLint warning backlog:
   - fixed hooks dependency warnings in:
     - `hillside-next/app/login/page.tsx`
     - `hillside-next/components/guest-services/GuestServicesClient.tsx`
     - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
     - `hillside-next/components/shared/SyncEngineProvider.tsx`
   - applied intentional per-line suppressions for current `img` usage in:
     - `hillside-next/app/page.tsx`
     - `hillside-next/components/guest-map/GuestMapClient.tsx`
     - `hillside-next/components/landing/GuestStoriesCarousel.tsx`
2. Minor content cleanup:
   - normalized guest-story rating display in `GuestStoriesCarousel` to ASCII-safe text (`*****`)
3. Validation:
   - `npm run lint` -> pass (`eslint` clean, Ruff clean)
   - `npm run typecheck` -> pass

## Batch D3 Execution Update (Part 1 Complete)

1. Revalidated full migration runtime path on local Supabase stack:
   - `npm run db:reset` now completes end-to-end on this workstation
2. Outcome:
   - previously blocking parser/runtime sequence around `20260418001_policy_escrow_alignment.sql` is resolved
   - split migration sequence `20260418001..20260418009` executes in order without SQL parser failures
3. Validation:
   - `npm run db:reset` -> pass
   - `npm run db:validate` -> pass (`db:sanity` + `db:hygiene`, `checked_files: 71`)

## Batch E3 Execution Update (Part 1 Complete)

1. Refreshed frontend baseline-browser mapping data dependency:
   - added/updated `baseline-browser-mapping` dev dependency in `hillside-next/package.json`
   - lockfile refreshed in `hillside-next/package-lock.json`
2. Outcome:
   - stale baseline notice is no longer shown in lint output
3. Validation:
   - `npm run lint` -> pass (no baseline-browser warning emitted)

## Batch D3 Execution Update (Part 2 Complete)

1. Re-validated migration idempotency/parsing behavior with an additional full reset cycle:
   - reran `npm run db:reset` on the same branch after prior success
2. Outcome:
   - function/policy/trigger DDL sequence remained stable on repeated reset
   - no recurrence of prepared-statement parser failure in split policy migration sequence
3. Validation:
   - `npm run db:reset` -> pass (repeat run)

## Batch E4 Execution Update (Part 1 Complete)

1. Added consolidated quality gate script in root `package.json`:
   - `quality:gate` -> `lint` + `typecheck` + `test:api` + `db:validate`
2. Hardened root testing script consistency:
   - added `test:api` (dedicated API pytest command)
   - added `test:contracts`
   - root `test` now chains `test:api` then `test:contracts`
3. Validation:
   - `npm run quality:gate` -> pass
   - results:
     - frontend lint clean
     - API Ruff clean
     - Next/shared typecheck pass
     - API tests `90 passed`
     - migration sanity/hygiene pass (`checked_files: 71`)

## Batch E4 Execution Update (Part 2 Complete)

1. Added cross-platform API Python launcher:
   - new helper script: `scripts/run-api-python.mjs`
   - selects interpreter in order:
     - `hillside-api/.venv/Scripts/python.exe` (Windows)
     - `hillside-api/.venv/bin/python` (Linux/macOS)
     - `python` from PATH (fallback)
2. Updated root commands to use launcher:
   - `lint` now runs Ruff via `node scripts/run-api-python.mjs -m ruff ...`
   - `test:api` now runs pytest via `node scripts/run-api-python.mjs -m pytest ...`
3. Outcome:
   - preserved Windows reliability
   - removed hard Windows path dependency from quality gate chain for CI/Linux reuse
4. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`90 passed`)
   - `npm run quality:gate` -> pass

## Batch B5 Execution Update (Part 1 Complete)

1. Consolidated route-local DTO definitions into shared API schema module:
   - `hillside-api/app/schemas/common.py` now owns:
     - `SessionRequest`, `SessionResponse`
     - `QrIssueRequest`, `QrVerifyRequest`, `QrPublicKeyResponse`
     - `PaymentSubmissionRequest`, `PaymentSubmissionResponse`, `PaymentRejectRequest`, `PaymentIntentUpdateRequest`
     - `CheckOperationRequest`
2. Updated v2 routes to consume shared DTOs instead of local in-file duplicates:
   - `hillside-api/app/api/v2/routes/auth.py`
   - `hillside-api/app/api/v2/routes/qr.py`
   - `hillside-api/app/api/v2/routes/payments.py`
   - `hillside-api/app/api/v2/routes/operations.py`
3. Outcome:
   - reduced duplicate schema declarations in route modules
   - keeps request/response contract types centralized for API cleanup track
4. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`90 passed`)
   - `npm run quality:gate` -> pass

## Batch B5 Execution Update (Part 2 Complete)

1. Removed deprecated Supabase facade fallback branches tied to pre-split schema drift:
   - `hillside-api/app/integrations/supabase_client.py`
   - removed legacy select constants and missing-column fallback runner:
     - `RESERVATION_LIST_SELECT_LEGACY`
     - `PAYMENT_SELECT_NO_POLICY`
     - `PAYMENT_SELECT_LEGACY`
     - `_is_missing_column_error(...)`
     - `_run_select_with_missing_column_fallbacks(...)`
   - simplified active flows to canonical schema selects for:
     - `list_recent_reservations(...)`
     - `list_admin_payments(...)`
2. Additional cleanup:
   - removed now-unused `_infer_reservation_source(...)` helper after fallback path removal.
3. Outcome:
   - reduced facade complexity and legacy branching in active reservation/payment list paths
   - behavior remains aligned with current migration-locked schema set
4. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`90 passed`)
   - `npm run quality:gate` -> pass

## Batch B5 Execution Update (Part 3 Complete)

1. Consolidated remaining route-local DTOs into shared API schema module:
   - `hillside-api/app/schemas/common.py` now also owns AI/NFT request-response models:
     - `PricingRecommendationRequest`
     - `OccupancyForecastRequest`, `OccupancyForecastItem`, `OccupancyForecastResponse`
     - `PricingApplyRequest`, `PricingApplyResponse`
     - `ConciergeRecommendationRequest`, `ConciergeSuggestion`, `ConciergeRecommendationResponse`
     - `GuestPassVerificationResponse`
2. Updated route modules to consume shared schema imports:
   - `hillside-api/app/api/v2/routes/ai.py`
   - `hillside-api/app/api/v2/routes/nft.py`
3. Outcome:
   - removed all in-route Pydantic class definitions in `app/api/v2/routes`
   - API DTO definitions are now centralized in `app.schemas.common`
4. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`90 passed`)
   - `npm run quality:gate` -> pass

## Batch B6 Execution Update (Part 1 Complete)

1. Reduced AI route parsing/normalization duplication in:
   - `hillside-api/app/api/v2/routes/ai.py`
2. Added shared helper functions for consistent normalization:
   - `_normalize_forecast_items(...)` for forecast item/date filtering and numeric occupancy conversion
   - `_normalize_concierge_result(...)` for concierge segment/source/model/suggestions/notes normalization
3. Reused helpers in active handlers:
   - `occupancy_forecast(...)`
   - `concierge_recommendation(...)`
   - `_build_response_from_saved_forecast(...)`
4. Added focused helper regression tests:
   - `hillside-api/tests/test_v2_ai_route_helpers.py`
5. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`93 passed`)
   - `npm run quality:gate` -> pass

## Batch B6 Execution Update (Part 2 Complete)

1. Added AI route contract regressions in:
   - `hillside-api/tests/test_v2_ai_contract.py`
2. New coverage verifies occupancy normalization behavior:
   - invalid forecast rows are filtered before persistence
   - normalized forecast items are returned in response payload
   - notes scalar normalization remains string-safe
3. New coverage verifies concierge normalization behavior:
   - `segment_key` normalization to snake_case
   - notes filtering/string normalization
   - persisted payload and response payload stay aligned
4. Validation:
   - `npm run lint` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 1 Complete)

1. Added shared server-side API bootstrap helper:
   - `hillside-next/lib/serverApi.ts`
   - new utility `fetchServerApiData(...)` centralizes:
     - API base URL normalization
     - bearer-token request wiring
     - optional timeout/abort handling
     - response schema validation via `safeParse`
     - null-safe failure behavior for SSR pages
2. Migrated server-rendered admin pages from duplicated fetch/parse blocks to shared helper:
   - `hillside-next/app/admin/page.tsx`
   - `hillside-next/app/admin/blockchain/page.tsx`
   - `hillside-next/app/admin/escrow/page.tsx`
   - `hillside-next/app/admin/audit/page.tsx`
   - `hillside-next/app/admin/reports/page.tsx`
   - `hillside-next/app/admin/payments/page.tsx`
   - `hillside-next/app/admin/reservations/page.tsx`
   - `hillside-next/app/admin/units/page.tsx`
3. Outcome:
   - reduced repeated SSR API bootstrap code across admin screens
   - standardized parse/error-null fallback behavior for initial page hydration data
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 2 Complete)

1. Extended shared `fetchServerApiData(...)` adoption to guest/public SSR preload flows and admin walk-in preload:
   - `hillside-next/app/book/page.tsx`
   - `hillside-next/app/my-bookings/page.tsx`
   - `hillside-next/app/tours/page.tsx`
   - `hillside-next/app/guest/my-stay/page.tsx`
   - `hillside-next/app/admin/walk-in/page.tsx`
2. Standardized schema-validated bootstrap for these paths:
   - available units preload (`availableUnitsResponseSchema`)
   - bookings preload (`myBookingsResponseSchema`)
   - services preload (`serviceListResponseSchema`)
   - stay dashboard + guest pass preload (`stayDashboardResponseSchema`, local guest pass schema)
3. Outcome:
   - reduced duplicated base-url/headers/response parsing branches outside admin core screens
   - consistent null-safe SSR fallback behavior now spans both admin and guest page bootstrap calls
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 3 Complete)

1. Added shared client-side API error normalization helper:
   - `hillside-next/lib/apiError.ts`
   - new utility: `getApiErrorMessage(error, fallback, overrides?)`
   - normalizes:
     - network/offline failures
     - `HTTP <status>: ...` payloads from `apiFetch`
     - common status defaults (`401/403/404/409/422/503`) with optional overrides
2. Adopted helper in high-traffic booking/operations clients:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/admin-walkin-tour/AdminWalkInTourClient.tsx`
   - `hillside-next/components/admin-walkin-stay/AdminWalkInStayClient.tsx`
   - `hillside-next/components/admin-services/AdminServicesClient.tsx`
   - `hillside-next/components/admin-blockchain/BlockchainExplorerClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
3. Outcome:
   - removed repeated ad-hoc `unknownError instanceof Error ? ...` branches in selected clients
   - standardized API/network failure text behavior for toasts and inline error banners
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 4 Complete)

1. Expanded `getApiErrorMessage(...)` adoption in core admin operations clients:
   - `hillside-next/components/admin-payments/AdminPaymentsClient.tsx`
   - `hillside-next/components/admin-reservations/AdminReservationsClient.tsx`
   - `hillside-next/components/admin-units/AdminUnitsClient.tsx`
2. Standardized additional failure branches:
   - list/detail/payment-proof/verify/reject/on-site flows now use shared API error normalization
   - admin auth fallback text (`Sign in required.` / `Admin access required.`) preserved for reservations header state
   - units timeout-specific UX preserved while using normalized API/network messages for other paths
3. Outcome:
   - reduced repeated local error parsing in admin reservation/payment/unit workflows
   - more consistent messaging for HTTP/auth/network/offline failure modes in high-frequency admin actions
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 5 Complete)

1. Expanded `getApiErrorMessage(...)` adoption in additional admin surfaces:
   - `hillside-next/components/admin-ai/AdminAiCenterClient.tsx`
   - `hillside-next/components/admin-dashboard/RoomManagementPanel.tsx`
2. Standardized additional failure branches:
   - AI pricing metrics/recommendation/apply/forecast/concierge errors now use shared API/network normalization.
   - Room management load/save errors now use shared API/network normalization for inline + toast messaging.
3. Outcome:
   - reduced remaining ad-hoc `unknownError instanceof Error ? ...` branches in admin AI/dashboard flows
   - improved consistency of HTTP/auth/network failure messaging across core admin operations
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C3 Execution Update (Part 1 Complete)

1. Moved admin AI center response contracts into shared package:
   - added schemas in `packages/shared/src/schemas.ts`:
     - `occupancyForecastItemSchema`
     - `occupancyForecastResponseSchema`
     - `conciergeSuggestionSchema`
     - `conciergeResponseSchema`
     - `pricingApplyResponseSchema`
   - added shared types in `packages/shared/src/types.ts`:
     - `OccupancyForecastItem`
     - `OccupancyForecastResponse`
     - `ConciergeSuggestion`
     - `ConciergeResponse`
     - `PricingApplyResponse`
2. Removed local duplicate contract definitions from:
   - `hillside-next/components/admin-ai/AdminAiCenterClient.tsx`
3. Outcome:
   - admin AI center now consumes shared schema/type source-of-truth for forecast/concierge/apply flows
   - reduced client-local contract drift risk and removed duplicate Zod definitions
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 6 Complete)

1. Expanded `getApiErrorMessage(...)` adoption in check-in operations:
   - `hillside-next/components/admin-checkin/AdminCheckinClient.tsx`
2. Standardized additional failure branches:
   - preload refresh failure toast
   - scan/manual validation failure toasts
   - queue sync failure status messages
   - check-out failure toast
3. Preserved domain-specific UX while normalizing transport failures:
   - existing check-in specific conflict/payment/offline guidance kept via `friendlyCheckinFailure(...)`
   - network detection now also covers normalized offline/network error text
4. Outcome:
   - reduced repeated ad-hoc `instanceof Error` message extraction in a high-traffic admin module
   - aligned check-in messaging behavior with shared API/network error normalization used in other admin flows
5. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C3 Execution Update (Part 2 Complete)

1. Moved QR public-key response contract into shared package:
   - added schema: `qrPublicKeyResponseSchema` in `packages/shared/src/schemas.ts`
   - added type: `QrPublicKeyResponse` in `packages/shared/src/types.ts`
2. Removed inline response typing from admin check-in client:
   - `hillside-next/components/admin-checkin/AdminCheckinClient.tsx`
   - switched `/v2/qr/public-key` call from inline generic object to shared type + schema parsing
3. Outcome:
   - reduced frontend contract drift risk for QR key bootstrap flow
   - improved consistency with shared schema/type source-of-truth strategy used across other admin/guest API calls
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 7 Complete)

1. Expanded `getApiErrorMessage(...)` adoption across guest-facing account/stay flows:
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/guest-stay/GuestOfflineQrCard.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
   - `hillside-next/components/layout/GuestChrome.tsx`
2. Standardized additional failure branches:
   - guest profile load/save/account-update errors
   - offline QR issue error
   - welcome-card dismiss failure toast
   - wallet connect/disconnect toast failures
3. Outcome:
   - reduced ad-hoc `instanceof Error` branches in guest account/stay interactions
   - aligned guest messaging with shared HTTP/auth/network/offline normalization behavior
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C3 Execution Update (Part 3 Complete)

1. Moved API health contract into shared package:
   - added schemas in `packages/shared/src/schemas.ts`:
     - `apiHealthChainStatusSchema`
     - `apiHealthMonitorSchema`
     - `apiHealthResponseSchema`
   - added types in `packages/shared/src/types.ts`:
     - `ApiHealthChainStatus`
     - `ApiHealthMonitor`
     - `ApiHealthResponse`
2. Updated status widget to use shared contract parsing:
   - `hillside-next/components/SessionAndApiStatus.tsx`
   - removed local `ApiHealth` type and switched to `apiHealthResponseSchema.safeParse(...)`
3. Outcome:
   - reduced local contract duplication for `/health` response
   - improved contract drift detection in dev status widget through explicit shape validation
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 8 Complete)

1. Expanded `getApiErrorMessage(...)` adoption in guest bookings core flow:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
2. Standardized additional failure branches:
   - bookings list load (replace/append)
   - booking details + AI recommendation load
   - payment submission fallback message mapping
   - cancel booking error state
   - QR issue error state
3. Preserved domain-specific payment guidance:
   - existing "deposit is not required" fallback path remains intact for full-payment correction messaging
4. Outcome:
   - reduced repeated `instanceof Error` parsing in the main guest bookings interaction surface
   - improved consistency of HTTP/auth/network/offline messaging with other migrated modules
5. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 9 Complete)

1. Expanded `getApiErrorMessage(...)` adoption across auth + shared upload utility:
   - `hillside-next/app/login/page.tsx`
   - `hillside-next/app/register/page.tsx`
   - `hillside-next/app/auth/forgot-password/page.tsx`
   - `hillside-next/components/shared/UnitPhotoUploader.tsx`
2. Standardized additional failure branches:
   - auth bootstrap/login/register/reset error surfaces now use shared API/network normalization
   - unit image upload queue failure reason now uses shared normalization for consistent user-facing messaging
3. Outcome:
   - reduced remaining ad-hoc `instanceof Error` message extraction in auth entrypoints
   - aligned upload utility errors with the same normalized HTTP/auth/network/offline messaging strategy used in other modules
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C2 Execution Update (Part 10 Complete)

1. Removed remaining ad-hoc `instanceof Error` fallback branches in active Next app flows:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/admin-checkin/AdminCheckinClient.tsx`
2. Standardized edge-path error text behavior:
   - payment submit edge handling in My Bookings now checks normalized message text
   - check-in token validation fallback now uses normalized message before applying user-facing reason mapping
   - camera startup branch now uses direct string coercion for detection-only paths (chunk/permission hints)
3. Outcome:
   - no remaining `instanceof Error ? ...` fallback expression branches in `hillside-next/app` + `hillside-next/components`
   - cleaner and more consistent error handling behavior across booking/check-in high-frequency user actions
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch C3 Execution Update (Part 4 Complete)

1. Moved guest map amenity pack contract into shared package:
   - added schemas in `packages/shared/src/schemas.ts`:
     - `guestMapAmenityKindSchema`
     - `guestMapAmenityPinSchema`
     - `guestMapAmenityPackSchema`
   - added shared types in `packages/shared/src/types.ts`:
     - `GuestMapAmenityKind`
     - `GuestMapAmenityPin`
     - `GuestMapAmenityPack`
2. Removed local map-contract duplication in:
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - replaced local `AmenityPin` type + normalization with shared schema parsing for:
     - network JSON pack
     - cache JSON pack
     - offline snapshot amenities
3. Outcome:
   - reduced map data-shape drift risk between static amenity JSON, cache reads, and UI rendering
   - aligned guest map data handling with shared schema/type source-of-truth cleanup direction
4. Validation:
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch D3 Execution Update (Part 1 Complete)

1. Removed the final legacy duplicate waiver migration file:
   - deleted `supabase/migrations/20260218_002_payment_rejection_reason.sql`
2. Enforced zero-waiver hygiene baseline in checker configuration:
   - `supabase/scripts/migration_hygiene_check.py`
   - `ALLOWED_LEGACY_FILENAMES` now empty
   - `ALLOWED_DUPLICATE_GROUPS` now empty
3. Outcome:
   - migration filename set now follows canonical naming only (`^\d{11}_[a-z0-9_]+\.sql$`)
   - duplicate-content waiver pair removed; hygiene now passes without legacy exceptions
4. Validation:
   - `npm run db:validate` -> pass
   - `python supabase/scripts/migration_hygiene_check.py` -> `ok: true`, `waived.legacy_filenames=[]`, `waived.duplicate_groups=[]`
   - `npm run lint` -> pass
   - `npm run typecheck` -> pass
   - `npm run test:api` -> pass (`95 passed`)
   - `npm run quality:gate` -> pass

## Batch E5 Execution Update (Part 1 Complete)

1. Refreshed cleanup quality report snapshot:
   - updated `docs/re-architecture-core/perf-report.md`
2. Captured latest integrated validation output from:
   - `npm run quality:gate`
3. Recorded passing status for:
   - lint
   - typecheck
   - API tests (`95 passed`)
   - DB validation (`db:sanity` + `db:hygiene`, both pass with zero waivers)
4. Outcome:
   - quality snapshot now reflects current cleanup state instead of legacy February-only performance notes
   - Checklist E final-report evidence target is now materially covered by a current gate snapshot

## Batch F2 Execution Update (Part 1 Complete)

1. Aligned cleanup status docs with current execution state:
   - `docs/re-architecture-core/10-next-gap-closure-plan.md`
   - `docs/re-architecture-core/13-cleanup-refactor-checklist.md`
   - `docs/re-architecture-core/14-cleanup-baseline-inventory.md`
2. Updated tracked status:
   - P3 marked `In progress`
   - checklist `Last updated` date refreshed
   - new completed batch markers for E5/F2 inserted
3. Outcome:
   - post-phase cleanup documentation now reflects current batch progression and remaining acceptance-evidence items

## Batch G1 Execution Update (Part 1 Complete - Planning)

1. Added dedicated guest UX improvement execution plan:
   - `docs/re-architecture-core/16-guest-ux-improvement-plan.md`
2. Defined UX-specific batch track (G1-G5):
   - audit/backlog
   - copy/information consistency
   - interaction/mobile/accessibility polish
   - offline trust messaging
   - validation evidence closure
3. Linked the new track in phase planning:
   - `docs/re-architecture-core/10-next-gap-closure-plan.md` now includes P4 guest UX optimization.
4. Outcome:
   - guest UX work now has a concrete, execution-ready plan instead of being implicitly bundled under generic cleanup.

## Batch G1 Execution Update (Part 2 Complete - Quick Wins)

1. Added route-level loading skeleton pages for high-traffic guest routes:
   - `hillside-next/app/book/loading.tsx`
   - `hillside-next/app/my-bookings/loading.tsx`
2. Improved guest bookings usability cues in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
3. UX quick wins delivered:
   - tab-specific contextual helper text
   - always-visible shortcut to `/guest/sync`
   - stronger empty-state recovery CTAs (book stay / browse tours)
   - booking-list loading skeleton cards (replacing plain loading text)
4. Outcome:
   - improved guest orientation and recovery paths without changing booking/payment rules.

## Batch G2 Execution Update (Part 1 Complete - Copy Consistency)

1. Updated guest microcopy and action clarity in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
2. Copy consistency updates delivered:
   - clearer check-in timer/QR wording for stay flow
   - clearer online vs offline request behavior and sync guidance for services
   - clearer payment submission next-step guidance and queued-action visual tone in bookings
3. Outcome:
   - guest-facing messaging is more explicit about what to do next and what status/state changes to expect.

## Batch G3 Execution Update (Part 1 Complete - Interaction Polish)

1. Updated booking interaction affordances in:
   - `hillside-next/components/book/BookNowClient.tsx`
2. Updated service-request interaction affordances in:
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
3. Interaction improvements delivered:
   - actionable disabled-state guidance and selection controls in booking flow
   - retry buttons for failed service/request history fetches
   - touch-friendly quantity controls with estimated total preview
   - status badge visual hierarchy in service timeline
4. Outcome:
   - reduced interaction ambiguity and improved mobile-friendly touch ergonomics in guest-critical actions.

## Batch G3 Execution Update (Part 2 Complete - Tours UX)

1. Updated tour booking interactions in:
   - `hillside-next/components/tours/ToursBookingClient.tsx`
2. Added route-level loading shell:
   - `hillside-next/app/tours/loading.tsx`
3. Interaction improvements delivered:
   - explicit disabled-state blocker guidance before submit
   - guest-count steppers for better touch/mobile ergonomics
   - retry button for service catalog fetch failures
   - clearer queued-sync success signaling in tour booking notices
4. Outcome:
   - improved completion guidance and action confidence in the guest tours flow without altering core booking/payment behavior.

## Batch G3 Execution Update (Part 3 Complete - Accessibility)

1. Applied modal accessibility semantics in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
2. Accessibility improvements delivered:
   - dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`)
   - status and error announcement semantics in modal feedback areas
3. Outcome:
   - improved screen-reader clarity and consistent accessible modal structure across guest-critical interactions.

## Batch G4 Execution Update (Part 1 Complete - Offline Confidence)

1. Added offline-confidence messaging updates in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
2. Offline UX improvements delivered:
   - consistent offline warning banners on guest action surfaces
   - direct `Open Sync Center` shortcuts where queued behavior is expected
   - clearer queued-success feedback alignment in services and booking flows
3. Outcome:
   - guests now get clearer expectations for offline behavior and explicit recovery path to sync visibility.

## Batch G4 Execution Update (Part 2 Complete - Alignment)

1. Extended offline confidence updates in:
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/shared/SyncCenter.tsx`
   - `hillside-next/app/guest/sync/page.tsx`
2. Alignment improvements delivered:
   - map offline banner with cached-data expectation and sync CTA
   - profile offline state banner and guarded update actions until reconnection
   - sync center offline guidance text aligned to queued-actions behavior
3. Outcome:
   - offline/cached language is now more consistent across guest map, profile, and sync surfaces.

## Batch C4 Execution Update (Part 1 Complete)

1. Standardized admin loading-state primitives to the shared skeleton component:
   - `hillside-next/app/admin/check-in/loading.tsx`
   - `hillside-next/app/admin/escrow/loading.tsx`
2. Cleanup details:
   - replaced route-local raw `div` placeholders (`bg-slate-*`, `animate-pulse`) with shared `Skeleton` nodes
   - preserved existing layout structure and dimensions to avoid UX behavior drift
3. Outcome:
   - reduced duplicated placeholder styling logic in admin routes
   - aligned loading-state rendering with shared UI primitive usage already present in other modules
4. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass

## Batch G5 Execution Update (Part 1 Complete - Acceptance Pack)

1. Added guest UX validation checklist and evidence template:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
2. Included closure-ready validation assets:
   - route-by-route manual scenario matrix for `/book`, `/tours`, `/my-bookings`, `/guest/my-stay`, `/guest/map`, `/guest/services`, `/guest/profile`, `/guest/sync`
   - screenshot naming convention and evidence-folder standard for reproducible sign-off
   - accessibility spot-check list and pass/fail sign-off table
3. Outcome:
   - G5 validation stage is prepared and ready for manual execution with linked evidence capture.

## Batch G5 Execution Update (Part 2 Complete - Evidence Workspace)

1. Added guest UX evidence workspace files:
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
   - `docs/re-architecture-core/evidence/guest-ux/manual-run-template.md`
2. Prepared manual-run capture structure:
   - stable screenshot naming map aligned to G5 scenario rows
   - ready-to-fill pass/fail matrix + accessibility check table for closure evidence
3. Outcome:
   - manual sign-off can now be executed in one pass with standardized artifact output.

## Batch G3 Execution Update (Part 4 Complete - Sync Loading Parity)

1. Added route-level loading shell for guest sync route:
   - `hillside-next/app/guest/sync/loading.tsx`
2. UI consistency updates delivered:
   - Sync Center now has explicit skeleton placeholders during route/content load
   - loading-state parity improved across guest-critical route set
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass

## Batch G5 Execution Update (Part 3 Complete - Preflight Gate)

1. Executed full integration quality gate prior to manual guest UX sign-off:
   - `npm run quality:gate`
2. Validation summary:
   - lint -> pass
   - typecheck -> pass
   - API tests -> pass (`95 passed`)
   - DB validation -> pass (`checked_files: 70`, zero waivers)
3. Outcome:
   - technical baseline is green for G5 manual UX acceptance execution.

## Batch G5 Execution Update (Part 4 Complete - Manual-Run Bootstrap)

1. Added helper script to bootstrap manual sign-off execution:
   - `docs/re-architecture-core/scripts/prepare-guest-ux-manual-run.ps1`
2. Added checklist/readme references for helper usage:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
3. Outcome:
   - tester can generate a dated run sheet quickly and start G5 scenario execution with less setup friction.

## Batch G5 Execution Update (Part 5 Complete - Closure Summary Scaffold)

1. Added G5 closure summary template:
   - `docs/re-architecture-core/evidence/guest-ux/g5-closure-summary-template.md`
2. Updated acceptance references:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
3. Outcome:
   - final decision artifact is ready once manual pass/fail evidence is completed.

## Batch C4 Execution Update (Part 2 Complete - Guest Sync Banner Reuse)

1. Added shared sync-feedback banner component:
   - `hillside-next/components/shared/SyncAlertBanner.tsx`
2. Replaced repeated offline/queued banner markup in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 3 Complete - Network Hook Reuse)

1. Added shared online/offline hook:
   - `hillside-next/lib/hooks/useNetworkOnline.ts`
2. Replaced repeated connectivity listener blocks in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
   - `hillside-next/components/guest-stay/GuestOfflineQrCard.tsx`
   - `hillside-next/components/shared/NetworkStatusBadge.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 4 Complete - Modal Shell Reuse)

1. Added shared modal shell component:
   - `hillside-next/components/shared/ModalDialog.tsx`
2. Replaced repeated modal wrapper/header/close markup in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - (details, payment, QR, and cancel dialogs)
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 5 Complete - Modal Shell Reuse Expansion)

1. Expanded shared modal shell usage:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
2. Cleanup details:
   - replaced repeated overlay + dialog + close scaffolding with `ModalDialog`
   - preserved component-specific modal content and action flows
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 6 Complete - Inset Card/List Primitive Reuse)

1. Added shared inset panel primitive:
   - `hillside-next/components/shared/InsetPanel.tsx`
2. Reused primitive across guest-facing card/list clusters:
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 7 Complete - Segmented Control Reuse)

1. Extended shared tabs control API:
   - `hillside-next/components/shared/Tabs.tsx`
2. Replaced guest-local segmented/filter controls with shared tabs in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 8 Complete - Currency Formatter Reuse)

1. Added shared PHP currency formatter:
   - `hillside-next/lib/formatCurrency.ts`
2. Replaced repeated guest formatting helpers in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 9 Complete - JWT Subject Parser Reuse)

1. Added shared JWT parser helper:
   - `hillside-next/lib/jwt.ts`
2. Replaced repeated guest token-sub parsing helpers in:
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 10 Complete - AI Source Helper Reuse)

1. Added shared AI pricing source helper:
   - `hillside-next/lib/aiPricing.ts`
2. Replaced repeated `getAiSource` helper in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 11 Complete - ISO Date Helper Reuse)

1. Added shared ISO date helper utilities:
   - `hillside-next/lib/dateIso.ts`
2. Replaced repeated guest date helper logic in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch C4 Execution Update (Part 12 Complete - Date-Time Display Helper Reuse)

1. Added shared date-time display helper module:
   - `hillside-next/lib/dateDisplay.ts`
2. Replaced repeated guest formatting helpers/usages in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch G6 Execution Update (Part 1 Complete - Guest Hero Foundation)

1. Upgraded shared header primitive for visual-consistency reuse:
   - `hillside-next/components/layout/PageHeader.tsx`
2. Applied hero-style header treatment to guest booking entry routes:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

## Batch G6 Execution Update (Part 2 Complete - Form + CTA Consistency)

1. Added shared guest form/CTA utility classes:
   - `hillside-next/app/globals.css`
2. Applied consistent control and CTA styling on high-traffic guest booking forms:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass
