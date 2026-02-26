# API_SURFACE_V2

This document defines canonical API contracts for the target FastAPI layer and compatibility expectations for incremental migration.

## 1) Shared Domain Types

### 1.1 Booking Status

`draft | pending_payment | escrow_locked | for_verification | confirmed | checked_in | checked_out | cancelled | no_show`

### 1.2 Escrow Reference

```json
{
  "chain_id": 80002,
  "contract_address": "0x...",
  "tx_hash": "0x...",
  "event_index": 0,
  "state": "pending|locked|released|refunded|failed"
}
```

### 1.3 QR Token

```json
{
  "jti": "uuid",
  "reservation_id": "uuid",
  "expires_at": "ISO-8601",
  "signature": "base64url",
  "rotation_version": 12
}
```

### 1.4 AI Recommendation Payload

```json
{
  "reservation_id": "uuid",
  "pricing_adjustment": 0.12,
  "confidence": 0.84,
  "explanations": ["high weekend demand", "occupancy trend"]
}
```

## 2) API Groups

### 2.1 Auth / Session

### `POST /v2/auth/session`

- Purpose: establish/refresh API session based on Supabase identity.
- Request:

```json
{ "supabase_access_token": "jwt" }
```

- Response:

```json
{ "session_id": "uuid", "user": { "id": "uuid", "role": "guest|admin" } }
```

- Idempotency: safe to repeat.
- Errors: `401 invalid_token`, `403 role_denied`.
- Authorization: public endpoint with token validation.

### 2.2 Reservations

### `POST /v2/reservations`

- Purpose: create reservation (off-chain authoritative write; optional escrow shadow).
- Request:

```json
{
  "check_in_date": "YYYY-MM-DD",
  "check_out_date": "YYYY-MM-DD",
  "unit_ids": ["uuid"],
  "service_booking": null,
  "payment_intent": { "amount": 1000, "type": "deposit|full" },
  "idempotency_key": "uuid"
}
```

- Response:

```json
{
  "reservation_id": "uuid",
  "reservation_code": "HR-...",
  "status": "pending_payment",
  "escrow_ref": null
}
```

- Idempotency: required (`idempotency_key`).
- Errors: `409 overlap_detected`, `422 invalid_dates`, `403 unauthorized`.
- Authorization: guest/admin (policy-scoped).

### `GET /v2/reservations/{reservation_id}`

- Purpose: full reservation detail with status and financial snapshot.
- Authorization: owner guest or admin.

### 2.3 Payments / Escrow

### `POST /v2/payments/submissions`

- Purpose: submit proof/reference for verification.
- Request:

```json
{
  "reservation_id": "uuid",
  "amount": 500,
  "payment_type": "deposit|full|on_site",
  "method": "gcash|cash|crypto",
  "reference_no": "optional",
  "proof_url": "optional",
  "idempotency_key": "uuid"
}
```

- Response:

```json
{
  "payment_id": "uuid",
  "status": "pending",
  "reservation_status": "for_verification"
}
```

- Idempotency: required.
- Errors: `409 duplicate_submission`, `422 invalid_amount`, `400 missing_proof`.
- Authorization: reservation owner or admin policy.

### `POST /v2/payments/{payment_id}/verify`

- Purpose: admin verification and reservation balance recompute.
- Authorization: admin only.
- Errors: `409 invalid_payment_state`.

### `POST /v2/payments/{payment_id}/reject`

- Purpose: admin rejection with reason.
- Request:

```json
{ "reason": "Reference number not found" }
```

- Authorization: admin only.

### `POST /v2/escrow/lock`

- Purpose: trigger escrow lock for reservation (feature-flagged phase).
- Authorization: internal/admin service role.

### 2.4 QR / Check-in

### `POST /v2/qr/issue`

- Purpose: issue rotating signed token for reservation.
- Response contains `qr_token` payload.

### `POST /v2/qr/verify`

- Purpose: verify token, prevent replay, and return eligibility.
- Request:

```json
{ "token": "serialized", "scanner_id": "uuid", "offline_mode": false }
```

- Response:

```json
{ "valid": true, "reservation_status": "confirmed", "action": "allow_checkin" }
```

### `POST /v2/checkins`

- Purpose: finalize check-in after verification.
- Authorization: admin/staff policy.

### `POST /v2/checkouts`

- Purpose: finalize check-out and settlement transition.
- Authorization: admin/staff policy.

### 2.5 Reports / AI

### `GET /v2/reports/overview`

- Purpose: aggregated KPI outputs with summary + daily + monthly series.
- Authorization: admin only.

### `GET /v2/reports/transactions`

- Purpose: payment transaction source for reports CSV export.
- Query:
  - `from_date`, `to_date`
  - optional: `status`, `method`, `payment_type`
  - pagination: `limit`, `offset`
- Authorization: admin only.

### 2.6 Units (Admin)

### `GET /v2/units`

- Purpose: paginated admin unit list with filters (`unit_type`, `is_active`, `search`).
- Authorization: admin only.

### `POST /v2/units`

- Purpose: create a new unit record.
- Authorization: admin only.

### `PATCH /v2/units/{unit_id}`

- Purpose: update mutable unit fields.
- Authorization: admin only.

### `DELETE /v2/units/{unit_id}`

- Purpose: soft delete unit (`is_active=false`), keep row history.
- Authorization: admin only.

### `PATCH /v2/units/{unit_id}/status`

- Purpose: toggle active state quickly from admin list UI.
- Authorization: admin only.

### `POST /v2/ai/pricing/predict`

- Purpose: return pricing adjustment recommendation.
- Request:

```json
{
  "unit_type": "room",
  "date": "YYYY-MM-DD",
  "occupancy_context": { "current": 0.71 }
}
```

- Response: AI recommendation payload.
- Behavior: non-blocking with fallback.

## 3) Error Model

All endpoints return a normalized error envelope:

```json
{
  "error": {
    "code": "string_code",
    "message": "human readable",
    "details": {},
    "correlation_id": "uuid"
  }
}
```

Common codes:

- `validation_error`
- `unauthorized`
- `forbidden`
- `conflict`
- `dependency_unavailable`
- `internal_error`

## 4) Authorization Model

- `guest`: own reservations/bookings/payments only.
- `admin`: full operational scope.
- `service_internal`: chain/worker/reconciliation operations.

Policy enforcement is centralized in API layer; Supabase RLS remains defense-in-depth during migration.

## 5) Event Contracts

These events are canonical for async consumers and reconciliation.

### `reservation.created`

```json
{ "reservation_id": "uuid", "reservation_code": "HR-...", "status": "pending_payment", "created_at": "ISO" }
```

### `escrow.locked`

```json
{ "reservation_id": "uuid", "escrow_ref": { "tx_hash": "0x...", "state": "locked" }, "locked_at": "ISO" }
```

### `qr.issued`

```json
{ "reservation_id": "uuid", "jti": "uuid", "expires_at": "ISO", "rotation_version": 4 }
```

### `checkin.verified`

```json
{ "reservation_id": "uuid", "scanner_id": "uuid", "verified_at": "ISO", "offline_reconciled": false }
```

### `settlement.completed`

```json
{ "reservation_id": "uuid", "status": "checked_out", "escrow_state": "released", "completed_at": "ISO" }
```

## 6) Compatibility Layer Rules

1. Existing frontend service calls can be proxied to `/v2/*` gradually.
2. New API responses must keep backward-compatible fields where legacy UI depends on them.
3. If V2 path is disabled, fallback to legacy RPC path without data loss.
