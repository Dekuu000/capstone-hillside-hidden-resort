# Migration Split Rationale (2026-04-18 Policy Rollout)

Last updated: 2026-04-19  
Scope: `supabase/migrations/20260418001` to `20260418009`

## Why this split was required

The policy rollout originally bundled multiple SQL commands (drop + create + grant blocks for several RPCs) into a single migration statement group.
In local reset runs, this caused parser/execution failure:

1. `SQLSTATE 42601`
2. `cannot insert multiple commands into a prepared statement`

To make the rollout parser-safe and replay-safe, we split the change set into small, ordered migration files with one logical purpose each.

## Final sequence and intent

1. `20260418001_policy_escrow_alignment.sql`
2. `20260418002_drop_create_reservation_atomic.sql`
3. `20260418003_create_reservation_atomic.sql`
4. `20260418004_grant_create_reservation_atomic.sql`
5. `20260418005_drop_create_tour_reservation_atomic.sql`
6. `20260418006_create_tour_reservation_atomic.sql`
7. `20260418007_grant_create_tour_reservation_atomic.sql`
8. `20260418008_create_cancel_reservation.sql`
9. `20260418009_grant_cancel_reservation.sql`

## Design principles used

1. `DDL isolation`: separate `DROP`, `CREATE`, and `GRANT` into dedicated files.
2. `Order safety`: apply policy/column alignment before redefining RPC return contracts.
3. `Idempotency`: use `IF EXISTS`/`IF NOT EXISTS`/constraint checks where needed.
4. `Privilege clarity`: keep grants explicit and close to corresponding function definitions.

## Behavior preserved

1. Stay reservation RPC returns policy metadata fields:
   - `deposit_policy_version`
   - `deposit_rule_applied`
   - `cancellation_actor`
   - `policy_outcome`
2. Tour reservation RPC returns the same policy metadata shape.
3. Cancellation RPC captures actor/outcome and writes audit log metadata.
4. Legacy duplicate waiver pair was later cleaned up in D3:
   - retained canonical file: `20260218006_payment_rejection_reason.sql`
   - removed legacy duplicate file: `20260218_002_payment_rejection_reason.sql`

## Validation evidence

1. `python supabase/scripts/migration_sanity_check.py` -> `ok: true`
2. `python supabase/scripts/migration_hygiene_check.py` -> `ok: true` (no legacy waivers)
3. `npm run db:validate` -> pass

## Remaining environment blocker

`npm run db:reset` is still blocked in this workstation by Docker Desktop pipe permissions:

1. `open //./pipe/dockerDesktopLinuxEngine: Access is denied`

This is an environment permission issue, not a migration parser/hygiene issue.
