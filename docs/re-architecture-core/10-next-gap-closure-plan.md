# Next Gap Closure Plan (Post-Defense)

Last updated: 2026-02-25
Context: Core guide-compliance scope (A-D) is complete and verified. This plan closes remaining guide gaps while keeping Sepolia as the active testnet.

## Prioritized Workstream

| Priority | Gap | Target Outcome | Effort | Exit Criteria |
|---|---|---|---|---|
| P0 | Sepolia hardening (active testnet) | Stabilize release quality on Sepolia end-to-end | 1-2 days | Escrow + GuestPass flows pass consistently on Sepolia with reconciliation clean |
| P0 | Production hardening + CI gate | Stable release quality gate | 1 day | CI runs API tests + contracts compile + migration checks + health smoke |
| P1 | Internal blockchain explorer UX | Unified admin explorer for escrow + guest pass + audit anchors | 1-1.5 days | New admin page with filters, tx links, status rollups |
| P1 | AI module completion (concierge) | Personalized recommendation endpoint + UI widget | 1.5-2 days | Guest/admin surfaces show deterministic recommendations with fallback |
| P1 | QR/PWA module completion (offline map) | Offline-capable resort map in guest app | 2-3 days | Map available offline with asset caching and location markers |
| P1 | Dashboard module completion (resource heatmap) | Cleaning/staff heatmap panel in admin | 1.5-2 days | Heatmap rendered from reservation/check-in density data |
| P2 | Security & privacy roadmap (ZKP) | Design RFC only (not implementation) | 0.5-1 day | Approved design note with constraints, threat model, phased rollout |

## Execution Order

## Phase 1 - Sepolia Reliability (P0)

1. Keep `CHAIN_ACTIVE_KEY=sepolia` for all active testing.
2. Validate Sepolia envs:
   - `EVM_RPC_URL_SEPOLIA`
   - `ESCROW_CONTRACT_ADDRESS_SEPOLIA`
   - `GUEST_PASS_CONTRACT_ADDRESS_SEPOLIA`
   - `ESCROW_SIGNER_PRIVATE_KEY_SEPOLIA`
3. Run full smoke:
   - reservation create -> escrow lock
   - guest pass mint + verify
   - check-in -> escrow release
   - reconciliation monitor clean (`alert=false`).
4. Add CI release gate:
   - `pytest`
   - contracts build
   - migration sanity query
   - API/AI health checks.

Runbook command:

```powershell
.\docs\re-architecture-core\scripts\sepolia-reliability-smoke.ps1 `
  -ApiBaseUrl "http://localhost:8000" `
  -LoopCount 10 `
  -SupabaseUrl "https://<project-ref>.supabase.co" `
  -SupabasePublishableKey "<publishable-key>" `
  -AdminEmail "<admin-email>" `
  -AdminPassword "<admin-password>"
```

## Phase 2 - Remaining Guide Features (P1)

1. Add internal Blockchain Explorer page in `hillside-next`.
2. Add AI concierge endpoint + response persistence.
3. Implement offline map module for guest.
4. Add admin resource heatmap panel.
5. Keep Polygon Amoy cutover prep as optional backlog, not active phase work.

## Phase 3 - Security Roadmap (P2)

1. Produce ZKP architecture note (no implementation in this phase).
2. Include:
   - on-chain commitment model
   - verifier placement
   - performance/cost assumptions
   - migration strategy from current reservation hash design.

## Technical Constraints (Locked)

1. Keep PII off-chain.
2. Preserve existing Supabase auth and data model.
3. Keep all new chain/AI features feature-flagged and non-blocking where possible.

## Acceptance Bundle

1. Updated docs:
   - `docs/re-architecture-core/08-gap-checklist.md`
   - `docs/re-architecture-core/07-demo-testplan.md`
   - `hillside-app/docs/PROJECT_STATUS.md`
2. Evidence artifacts:
   - Sepolia tx hashes (lock/release/mint)
   - reconciliation summary
   - forecast + concierge sample outputs
   - UI screenshots (explorer/map/heatmap).
