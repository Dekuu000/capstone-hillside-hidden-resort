# Database Core (Supabase)

## Canonical location

- Root data plane folder: `supabase/`
  - `supabase/migrations/*`
  - `supabase/functions/*`

## Migration policy

- Additive, non-breaking changes only during phased migration.
- Preserve immutable audit/payment history.
- Avoid overloaded SQL function signatures for RPC stability.

## V2 extension targets

- Reservation chain linkage fields (`escrow_state`, `chain_tx_hash`, `onchain_booking_id`).
- QR token table (`qr_tokens`) for rotation and anti-replay.
- AI signals table (`pricing_signals`) for feature logging and inference traceability.
