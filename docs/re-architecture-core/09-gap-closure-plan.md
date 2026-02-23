# Gap Closure Plan (Priority + Effort)

Last updated: 2026-02-23
Inputs: `08-gap-checklist.md`, instructor PDF guide, current Wave 5 baseline.

## Execution Status (as of 2026-02-23)

- `A` Documentation/runtime alignment: completed.
- `B` AES-256 + IndexedDB offline queue: completed.
- `C` NFT guest pass ERC721 + mint/verify API: completed.
- `D` AI forecasting with scikit + Supabase persistence: completed.
- Remaining deferred scope: ZKP, MetaMask direct wallet UX, concierge/maps/heatmap.

## Delivery Strategy

- Keep existing Supabase auth/data model intact.
- Keep PII off-chain; only reservation IDs/hashes and token IDs on-chain.
- Deliver in small, reviewable commits in this exact order:
  1. `A` Documentation/runtime alignment
  2. `B` Secure offline storage (AES-256 + IndexedDB)
  3. `C` NFT guest pass (minimal ERC721 + mint/verify)
  4. `D` AI forecasting upgrade (scikit/Prophet-ready + persistence)

## Priority Backlog

| Priority | Work Item | Scope | Effort (est.) | Risk | Exit Criteria |
|---|---|---|---|---|---|
| P0 | A) Sepolia/Polygon + escrow flow alignment | Update architecture docs + ensure runtime/docs escrow release phase is consistent | 0.5 day | Low | Docs and API behavior are consistent and tested |
| P0 | B) AES-256 encrypted IndexedDB queue | Replace admin offline queue localStorage with encrypted IndexedDB | 1.0 day | Medium | Offline queue encrypted at rest and sync behavior unchanged |
| P1 | C) NFT guest pass | Add minimal ERC721 contract + API mint on reservation + verify endpoint | 1.5-2.0 days | Medium | Mint tx hash/token ID stored; verify endpoint returns on-chain status |
| P1 | D) AI forecasting + persistence | Add scikit/Prophet-ready forecasting endpoint + store forecast rows in DB | 1.0-1.5 days | Medium | Forecast endpoint returns data and persists run metadata/results |
| P2 | Guide extras (not in this cycle) | ZKP, concierge, map explorer, heatmap | Deferred | High | Explicitly tracked as future work |

## Implementation Detail

## A) Documentation/Runtime Alignment (P0)

Actions:
1. Update architecture docs to state:
   - `Sepolia` is active development chain.
   - `Polygon Amoy` remains target/cutover chain.
2. Resolve escrow flow mismatch so docs and code match one canonical behavior.
3. Update demo script to show expected release event timing.

Acceptance:
1. `docs/re-architecture-core/*` no longer conflicts with runtime.
2. Check-in/checkout escrow transition is deterministic and documented.

## B) Secure Offline Queue (P0)

Actions:
1. Add client utility for encrypted IndexedDB storage.
2. Encrypt queue payload with AES-256 (Web Crypto AES-GCM, 256-bit key).
3. Migrate admin check-in queue read/write/sync to this utility.
4. Keep queue UX and sync semantics unchanged.

Acceptance:
1. No plaintext queue payload in localStorage.
2. IndexedDB entry is ciphertext + IV/salt metadata only.
3. Existing queue sync operations still pass smoke tests.

## C) NFT Guest Pass (P1)

Actions:
1. Add minimal ERC721 contract (`GuestPassNFT.sol`) with controlled minter.
2. Add contract deploy script support and env wiring for NFT contract address.
3. Add API mint flow after successful reservation create (non-blocking, feature-flagged).
4. Persist minted token metadata (`token_id`, `tx_hash`, `chain_key`) on reservation row.
5. Add verification endpoint (`GET /v2/nft/guest-pass/{reservation_id}`) for admin/owner.

Acceptance:
1. Reservation create can mint NFT when feature enabled and chain configured.
2. API returns verification status + token metadata.
3. No PII is written on-chain.

## D) AI Forecasting Upgrade (P1)

Actions:
1. Add `scikit-learn` dependency (and keep Prophet optional due environment constraints).
2. Implement occupancy forecast endpoint in AI service (7-day horizon).
3. Add API endpoint to request/store forecast results in Supabase.
4. Add DB migration for forecast table.

Acceptance:
1. `/v2/ai/occupancy/forecast` returns forecast series.
2. Forecast run and outputs persist in DB with timestamps and model metadata.
3. Existing pricing endpoint remains backward-compatible.

## Non-Goals (Explicit)

1. Advanced ZKP implementation in this phase.
2. Full MetaMask wallet UX in this phase.
3. Full map explorer + resource heatmap in this phase.

These stay documented as post-defense roadmap items.

## Rollout & Validation

1. Run smoke after each commit (API health, QR flow, reservation flow).
2. Keep feature flags default-safe for new chain/AI/NFT paths.
3. If failure occurs, rollback to latest Wave 5 tag and re-run baseline smoke.
