# ZKP Security Roadmap RFC (Design-Only)

Last updated: 2026-04-18
Status: Approved for roadmap planning, not implementation in this phase
Owner: Hillside PWA Upgrade Plan (Phase 3 / P2)

## 1) Scope

This RFC defines how zero-knowledge proofs can be introduced without breaking the current architecture.

In scope:

1. On-chain commitment model.
2. Verifier placement options and selected direction.
3. Threat model and controls.
4. Cost/performance assumptions.
5. Phased migration from current reservation hash anchoring.

Out of scope:

1. Circuit implementation.
2. On-chain verifier deployment.
3. Replacing current production auth/session model.

## 2) Current Baseline

1. PII stays off-chain.
2. Reservation/payment operational data remains in Supabase.
3. Audit anchoring and escrow flows already exist.
4. Chain runtime is feature-flagged and environment-driven.

## 3) Design Goals

1. Improve privacy guarantees for verifiable reservation/payment claims.
2. Keep verification optional and non-blocking during rollout.
3. Avoid storing direct guest-identifying data on-chain.
4. Preserve backward compatibility with existing hashed audit strategy.

## 4) Proposed Commitment Model

Commitment payload (example fields):

1. `reservation_id` (UUID, canonicalized)
2. `policy_version`
3. `status_transition`
4. `amount_bucket` (coarse bucket, not exact amount when possible)
5. `event_time_window`
6. `nonce`

Derivation:

1. Build a canonical payload string in a strict field order.
2. Hash payload with domain separation (`hillside:v1:zk-commit`).
3. Include rotating salt/nonce managed server-side.
4. Publish only commitment hash and proof reference metadata to chain.

Privacy note:

1. No raw email, name, phone, or direct profile fields are allowed in commitments.

## 5) Verifier Placement Options

Option A: On-chain verifier first

1. Strongest trust minimization.
2. Highest gas and operational complexity.
3. Hardest to iterate during capstone timeline.

Option B: Off-chain verifier + on-chain proof anchor (selected first step)

1. Verify proofs in backend service.
2. Anchor proof result hash and verification metadata on-chain.
3. Lower gas and rollout risk while preserving tamper-evident auditability.

Decision:

1. Adopt Option B first.
2. Re-evaluate Option A after operational metrics and circuit stability are proven.

## 6) Threat Model Summary

### Assets

1. Reservation/payment integrity state.
2. Proof generation secrets/keys.
3. Verifier trust and audit trail consistency.

### Trust Boundaries

1. Client <-> API.
2. API <-> Supabase.
3. API <-> chain RPC.
4. API <-> proof generation/verification subsystem.

### Main Abuse Paths and Mitigations

1. Forged proof submission.
   - Mitigation: strict schema validation, signed proof envelope, replay nonce, bounded proof age.
2. Proof replay across reservations.
   - Mitigation: bind proof public inputs to reservation id + policy version + nonce.
3. Metadata tampering before anchoring.
   - Mitigation: deterministic canonical payload hashing and audit log cross-check.
4. Verifier bypass through fallback paths.
   - Mitigation: explicit verification status flags, deny silent success, alert on bypass.
5. Key leakage for proof signing.
   - Mitigation: secret manager + rotation policy + split duties + emergency revoke path.

## 7) Performance and Cost Assumptions

1. Baseline target: do not add blocking latency to core reservation flow in initial rollout.
2. Verification should run async or in bounded background path when possible.
3. On-chain writes remain minimal: anchor only compact commitment/proof result hashes.
4. Gas budget should prioritize escrow/payment critical paths over proof-heavy writes.

## 8) Migration Strategy from Current Hash Design

Phase M0 - Preparation

1. Define canonical commitment schema and versioning.
2. Add feature flags:
   - `FEATURE_ZKP_PROOF_CAPTURE`
   - `FEATURE_ZKP_VERIFY_ENFORCE`
   - `FEATURE_ZKP_ANCHOR_WRITE`

Phase M1 - Shadow Mode

1. Generate commitments/proofs in parallel for sampled traffic.
2. Verify off-chain and store results in Supabase.
3. Do not gate booking/check-in outcomes yet.

Phase M2 - Soft Enforcement

1. Enable verification requirement for selected low-risk transitions.
2. Keep fallback path with explicit audit marker and alert.

Phase M3 - Hardened Mode

1. Remove silent fallback.
2. Require verified proof status for configured transitions.
3. Consider selective on-chain verifier expansion only after stable metrics.

## 9) Rollout Guardrails

1. Keep all ZKP features feature-flagged.
2. Keep PII off-chain at all times.
3. Require compatibility with existing Supabase auth and reservation schema.
4. Require observability dashboards for proof success/failure/replay rates before any enforcement increase.

## 10) Exit Criteria (P2 Completion)

1. This RFC is published and linked in plan docs.
2. Threat model, verifier placement, and migration path are explicitly documented.
3. Team decision recorded: design approved, implementation deferred.
