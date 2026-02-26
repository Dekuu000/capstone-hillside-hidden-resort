# MIGRATION_ROADMAP

## Migration Strategy

Phased strangler migration with zero-downtime objective and reversible cutovers.

## Phase 0 - Foundation Bootstrap

### Entry criteria

- Legacy platform is stable.
- Team agrees on target stack and status model.

### Tasks

1. Bootstrap Next.js shell (guest/admin route placeholders).
2. Bootstrap FastAPI service with health checks and auth/session primitives.
3. Create Polygon Amoy contract workspace and CI compile/deploy checks.
4. Define shared types: status enum, `escrow_ref`, `qr_token`, AI payload.
5. Add feature flag framework for legacy/v2 routing.

### Exit criteria

- Next.js, FastAPI, and contract projects build in CI.
- Baseline observability and correlation ID propagation defined.
- Active dev-chain deployment proof is recorded (`chain`, `chain_id`, `contract_address`, `deploy_tx_hash`, `deployed_at_utc`).

### Rollback plan

- Keep all traffic on legacy Vite + Supabase path.

### Observability checks

- CI pass rates for all new runtimes.
- Health endpoint uptime and basic request tracing.

## Phase 1 - API Facade over Existing Workflows

### Entry criteria

- Phase 0 complete.

### Tasks

1. Implement FastAPI reservation/payment/QR read-write wrappers around current Supabase data.
2. Introduce idempotency keys for create/submit flows.
3. Add API compatibility adapter for legacy frontend calls.
4. Run shadow reads and compare payload parity with existing services.

### Exit criteria

- Selected legacy flows can run through FastAPI without data model drift.

### Rollback plan

- Disable feature flags and route all calls back to current frontend service layer.

### Observability checks

- API success/error rates.
- Payload mismatch counters between legacy and facade responses.

## Phase 2 - Polygon Escrow Deployment + Shadow Write

### Entry criteria

- FastAPI facade stable for booking/payment flows.

### Tasks

1. Deploy escrow contracts to Polygon Amoy.
2. Implement shadow-write escrow lock on booking creation/payment milestones.
3. Persist chain refs in Supabase (`chain_tx_hash`, `onchain_booking_id`, `escrow_state`).
4. Build reconciliation worker for chain/off-chain consistency.

### Exit criteria

- Escrow shadow success rate meets threshold.
- Reconciliation mismatch rate below agreed error budget.

### Rollback plan

- Disable escrow shadow flag; preserve off-chain booking flow.

### Observability checks

- Escrow tx success/latency.
- Confirmation lag.
- Reconciliation mismatch trend.

## Phase 3 - Dynamic QR Service Migration

### Entry criteria

- Stable chain shadow write and reservation consistency.

### Tasks

1. Implement signed rotating QR token service (target 30s rotation).
2. Add anti-replay nonce/jti store and expiration policy.
3. Integrate offline queue and reconnect reconciliation.
4. Add scanner-side UX for offline/online state.

### Exit criteria

- Replay attempts are blocked.
- Offline queue reconciles without state corruption.

### Rollback plan

- Revert scanner/token generation to legacy path.

### Observability checks

- QR validation success/failure rates.
- Replay rejection counts.
- Queue backlog age and size.

## Phase 4 - AI Service Integration

### Entry criteria

- Core transactional flows stable under v2 API.

### Tasks

1. Deploy Prophet/scikit-learn inference service.
2. Implement pricing/forecast endpoints in FastAPI with timeout/fallback.
3. Store pricing signals for audit and model monitoring.
4. Expose AI recommendations to admin dashboards.

### Exit criteria

- AI responses available within SLO and do not block booking flow.

### Rollback plan

- Switch to deterministic/rule-based fallback via feature flag.

### Observability checks

- Inference latency.
- Fallback rate.
- Prediction freshness/version metrics.

## Phase 5 - Final Cutover + Legacy Deprecation

### Entry criteria

- V2 parity validated across guest/admin critical paths.

### Tasks

1. Route primary traffic to Next.js + FastAPI paths.
2. Mark legacy endpoints read-only, then deprecate.
3. Freeze migration mappings and archive compatibility adapters.
4. Complete incident runbooks and operational ownership handoff.

### Exit criteria

- Legacy write paths disabled without data loss.
- Production KPIs are stable post-cutover.

### Rollback plan

- Re-enable legacy path flags within agreed rollback window.

### Observability checks

- Booking success rate trend.
- Escrow/QR/settlement error budgets.
- Incident volume and MTTR after cutover.
