# Audit Rules (Phase 6)

Last updated: 2026-02-12

## Purpose
Provide a consistent, tamper-evident audit trail for critical system events.
Phase 6 uses **DB-only hashes** (no blockchain anchoring yet).

## Where Audit Logs Are Written
- `public.audit_logs` (immutable, insert-only)
- Helper: `public.create_audit_log(...)`
- Reservation status changes also trigger `audit_reservation_update` on `public.reservations`

## Phase 6: Required Audit Events
**Reservations**
- create (units/tours)
- cancel
- checkin
- checkout
- override_checkin

**Payments**
- submit proof (create)
- verify / reject
- on-site payment recorded (create)

## Action Mapping (DB)
These are the actions currently used by RPCs/triggers:
- `create`
- `verify`
- `reject`
- `cancel`
- `checkin`
- `checkout`
- `override_checkin`

## Hashing (DB-only)
Each audit entry stores:
- `data_hash` = `sha256(payload)`
- `metadata` = JSON with key fields for traceability

**Standard payload guidance (going forward):**
```
entity_id + action + timestamp
```

Note: existing RPCs already write hashes based on their internal payloads
(e.g., reservation code, amount, timestamp). Phase 6 does not change those
historical hashes—only ensures coverage and documentation.

## Reference: Audit Sources
- `create_reservation_atomic` / `create_tour_reservation_atomic`
- `submit_payment_proof`
- `verify_payment`
- `record_on_site_payment`
- `perform_checkin` / `perform_checkout`
- `audit_reservation_update` trigger

## Phase 7 (Planned)
Optional blockchain anchoring of `data_hash` values (no PII).
