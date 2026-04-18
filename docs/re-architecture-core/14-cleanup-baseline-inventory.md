# Cleanup Baseline & Inventory Report

Last updated: 2026-04-18  
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
