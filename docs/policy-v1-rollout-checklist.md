# Policy v1 Rollout Checklist (Deposit + Cancellation + Escrow)

## Locked policy behavior
- Version: `v1_2026_04`
- Stay (room/cottage): `20%` of total, clamped to `PHP 500` - `PHP 1000`, capped by total.
- Tour: fixed `PHP 500`, or full total when total is below `PHP 500`.
- Release trigger: check-in.
- Cancellation:
  - Guest cancellation: `forfeited`.
  - Admin cancellation: `refunded`.

## API metadata fields (additive)
- `deposit_policy_version`
- `deposit_rule_applied`
- `cancellation_actor`
- `policy_outcome`

## Migration + backend
1. Validate migration set before runtime checks:
   - `npm run db:validate`
2. Apply policy rollout migrations in order:
   - `supabase/migrations/20260418001_policy_escrow_alignment.sql`
   - `supabase/migrations/20260418002_drop_create_reservation_atomic.sql`
   - `supabase/migrations/20260418003_create_reservation_atomic.sql`
   - `supabase/migrations/20260418004_grant_create_reservation_atomic.sql`
   - `supabase/migrations/20260418005_drop_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418006_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418007_grant_create_tour_reservation_atomic.sql`
   - `supabase/migrations/20260418008_create_cancel_reservation.sql`
   - `supabase/migrations/20260418009_grant_cancel_reservation.sql`
3. Restart API server after migration.
4. Verify reservation creation returns policy metadata fields.

## Quick validation scenarios
1. Stay booking where total is large enough:
   - confirm deposit follows `20%` clamp (500-1000).
2. Tour booking:
   - confirm expected pay now is `min(total, 500)`.
3. Guest cancellation:
   - response includes `cancellation_actor=guest`, `policy_outcome=forfeited`.
4. Admin cancellation:
   - response includes `cancellation_actor=admin`, `policy_outcome=refunded`.
5. Check-in release:
   - check-in operation persists `policy_outcome=released`.

## UI checks
- Guest `/book` shows deposit rule hint.
- Guest `/my-bookings` cancellation confirmation clearly states forfeiture behavior.
- Admin `/admin/payments` displays policy outcome + deposit rule context when available.
