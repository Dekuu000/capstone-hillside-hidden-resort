# Next Gap Closure Plan (Post-Defense)

Last updated: 2026-04-25
Context: Core guide-compliance scope (A-D) remains complete. This plan now reflects actual implementation status, closes the P2 design requirement, and locks the post-phase cleanup track.

## Prioritized Workstream

| Priority | Gap | Target Outcome | Effort | Status | Exit Criteria |
|---|---|---|---|---|---|
| P0 | Sepolia hardening (active testnet) | Stabilize release quality on Sepolia end-to-end | 1-2 days | Completed (2026-02-25) | Escrow + GuestPass flows pass consistently on Sepolia with reconciliation clean |
| P0 | Production hardening + CI gate | Stable release quality gate | 1 day | Completed (2026-04-18) | CI runs API tests + contracts compile + migration checks + health smoke |
| P1 | Internal blockchain explorer UX | Unified admin explorer for escrow + guest pass + audit anchors | 1-1.5 days | Completed (2026-04-18) | Admin blockchain page supports status, reconciliation, audit links |
| P1 | AI module completion (concierge) | Personalized recommendation endpoint + UI widget | 1.5-2 days | Completed (2026-04-18) | Guest/admin surfaces show deterministic recommendations with fallback |
| P1 | QR/PWA module completion (offline map) | Offline-capable resort map in guest app | 2-3 days | Completed (2026-04-18) | Map route available offline with cached shell + location markers |
| P1 | Dashboard module completion (resource heatmap) | Cleaning/staff heatmap panel in admin | 1.5-2 days | Completed (2026-04-18) | Heatmap panel rendered from reservation/check-in density context |
| P2 | Security & privacy roadmap (ZKP) | Design RFC only (not implementation) | 0.5-1 day | Completed (2026-04-18) | Approved design note with constraints, threat model, phased rollout |
| P3 | Post-phase code cleanup + refactor | Cleaner, easier-to-maintain and scalable codebase | 2-4 days | In progress | Cleanup checklist executed with green lint/tests and documented removals |
| P4 | Guest UI/UX optimization | Improve guest journey clarity, mobile usability, and offline confidence | 1-2 days | In progress (2026-04-25) | Guest UX plan executed with evidence-backed improvements across booking/stay/map/services |

## Execution Order

## Phase 1 - Sepolia Reliability (P0)

1. Keep `CHAIN_ACTIVE_KEY=sepolia` for active testing and smoke verification.
2. Validate Sepolia envs:
   - `EVM_RPC_URL_SEPOLIA`
   - `ESCROW_CONTRACT_ADDRESS_SEPOLIA`
   - `GUEST_PASS_CONTRACT_ADDRESS_SEPOLIA`
   - `ESCROW_SIGNER_PRIVATE_KEY_SEPOLIA`
3. Run full smoke:
   - reservation create -> escrow lock
   - guest pass mint + verify
   - check-in -> escrow release
   - reconciliation monitor clean (`alert=false`)
4. Enforce CI release gate in `.github/workflows/ci.yml`:
   - API tests
   - contracts compile
   - migration sanity checks
   - API/AI health smoke
   - optional Sepolia smoke when secrets exist

Execution evidence:

1. `docs/re-architecture-core/sepolia-reliability-report.json`
2. Generated `2026-02-25T23:29:17.9279047+08:00`
3. `loop_count=10`, `success_count=10`, `success_rate=100`
4. All runs passed with `reconciliation_alert=false`

## Phase 2 - Remaining Guide Features (P1)

Implementation evidence:

1. Explorer UX: `hillside-next/app/admin/blockchain/page.tsx`
2. Concierge endpoint + persistence: `hillside-api/app/api/v2/routes/ai.py` and `supabase/migrations/20260302002_ai_concierge_suggestions.sql`
3. Offline map page: `hillside-next/app/guest/map/page.tsx`
4. Resource heatmap panel: `hillside-next/components/admin-dashboard/ResourceHeatmapPanel.tsx`

## Phase 3 - Security Roadmap (P2)

Design-RFC evidence:

1. `docs/re-architecture-core/12-zkp-security-roadmap-rfc.md`
2. Scope remains design-only; no ZKP implementation is introduced in this phase.

## Phase 4 - Code Cleanup & Refactor (Post-Phase, Locked)

This phase is intentionally scheduled after completion of P0-P2.

1. Remove deprecated compatibility paths that are no longer needed.
2. Normalize migration naming and remove temporary/recovery artifacts from tracked scope.
3. Consolidate duplicate DTO/types and enforce shared schema source-of-truth.
4. Tighten lint/type/test gates and fix drift hotspots.
5. Refresh docs to match final architecture and operational runbooks.
6. Execute against the tracked checklist: `docs/re-architecture-core/13-cleanup-refactor-checklist.md`.

## Technical Constraints (Locked)

1. Keep PII off-chain.
2. Preserve existing Supabase auth and data model.
3. Keep chain/AI features feature-flagged and non-blocking where possible.
4. Do cleanup/refactor work only after P0-P2 closure (this is decision-locked).

## Acceptance Bundle

1. Updated docs:
   - `docs/re-architecture-core/08-gap-checklist.md`
   - `docs/re-architecture-core/07-demo-testplan.md`
   - `hillside-app/docs/PROJECT_STATUS.md`
   - `docs/re-architecture-core/12-zkp-security-roadmap-rfc.md`
   - `docs/re-architecture-core/13-cleanup-refactor-checklist.md`
2. Evidence artifacts:
   - Sepolia tx hashes (lock/release/mint)
   - reconciliation summary
   - forecast + concierge sample outputs
   - UI screenshots (explorer/map/heatmap)

## Immediate Next Step

1. Continue Phase 4 cleanup/refactor using `docs/re-architecture-core/13-cleanup-refactor-checklist.md` with incremental commits.
2. Complete remaining acceptance evidence:
   - manual smoke output bundle (reservation/payment/QR/blockchain/AI/sync)
   - CI evidence link/log for `quality:gate` parity
3. Start guest UX optimization track using `docs/re-architecture-core/16-guest-ux-improvement-plan.md` (G1 audit backlog first).
4. Close remaining operational/documentation drift discovered during cleanup.
