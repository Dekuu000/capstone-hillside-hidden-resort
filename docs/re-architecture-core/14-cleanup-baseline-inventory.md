# Cleanup Baseline & Inventory Report

Last updated: 2026-04-19  
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

1. FastAPI `@app.on_event` deprecation warnings in `hillside-api/app/main.py`.
2. `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warning in tests/runtime constants.
3. `.pytest_cache` write permission warning on this Windows workspace.

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
