# Cleanup & Refactor Checklist (Post-Phase)

Last updated: 2026-04-19  
Status: Planned  
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

- [ ] Consolidate duplicate DTO/response schema definitions.
- [ ] Remove deprecated facade fallback paths no longer needed by active flows.
- [ ] Standardize error mapping and response envelope behavior.
- [ ] Refactor large handlers into smaller service functions where complexity is high.
- [ ] Add/update tests for every refactor hotspot before removal.
- [x] Batch B1 (part 1): consolidate reservation policy metadata DTO/shared-type definitions and remove repeated route mapping blocks.
- [x] Batch B1 (part 2): centralize reservation update/fallback helpers in Supabase integration and remove repeated policy metadata persistence logic in operations route.

### C) Frontend and Shared Contracts

- [ ] Align all data contracts with `packages/shared` as source of truth.
- [ ] Remove duplicate client-side type definitions superseded by shared schemas.
- [ ] Normalize API fetch wrappers and error handling across admin/guest modules.
- [ ] Remove dead components/routes and obsolete compatibility redirects.
- [ ] Re-run end-to-end manual smoke for reservation, payment, QR, blockchain, AI, sync pages.
- [x] Batch A3: consolidate legacy admin compatibility redirects from page files into `next.config.ts` redirects.
- [x] Batch C1 (part 1): unify reservation policy enum constants in shared package and align cancellation outcome handling in `MyBookingsClient`.
- [x] Batch C1 (part 2): centralize stay deposit preview logic in shared contracts and reuse in booking/cancellation UI messaging.

### D) Database and Migration Hygiene

- [ ] Standardize migration naming format and ordering consistency.
- [ ] Remove temporary/recovery files from tracked project scope.
- [ ] Ensure `supabase db reset` and repository migration sanity checks pass cleanly.
- [ ] Verify function/policy/trigger definitions are idempotent and parser-safe.
- [ ] Update migration notes with rationale for any split or reordering.
- [x] Batch A2: add automated migration hygiene check with explicit waiver tracking for legacy filename/duplicate pair.
- [x] Batch D1 (part 1): add a single `db:validate` workflow (`db:sanity` + `db:hygiene`) and re-verify migration checks on current rename/split set.
- [x] Batch D1 (part 2): document 2026-04-18 migration split/reorder rationale and parser-safety sequencing.
- [x] Batch D2 (part 1): untrack `supabase/.temp/cli-latest` so Supabase temp state no longer pollutes repository diffs.
- [x] Batch D2 (part 2): remove legacy underscore-index migration duplicates and add split `20260418001..20260418009` policy rollout migrations.

### E) CI, Lint, and Test Hardening

- [ ] Keep CI release gate green after each cleanup batch.
- [ ] Enforce strict lint/type rules on touched modules.
- [ ] Add missing regression tests for previous production incidents.
- [ ] Remove flaky or redundant tests and replace with deterministic coverage.
- [ ] Publish a final quality report snapshot in `docs/re-architecture-core/perf-report.md`.

### F) Documentation Alignment

- [ ] Update architecture, checklist, and status docs to reflect final cleaned state.
- [ ] Update developer runbook commands and local dev troubleshooting notes.
- [ ] Record removed modules/files and migration implications.
- [ ] Attach final acceptance evidence links (CI run, smoke output, key screenshots).
- [x] Batch F1 (part 1): align policy rollout runbook with split migration sequence and `db:validate` preflight.

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
