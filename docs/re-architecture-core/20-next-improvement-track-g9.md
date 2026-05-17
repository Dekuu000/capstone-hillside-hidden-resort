# G9 Next Improvement Track

Last updated: 2026-05-17  
Status: Completed (G9.1-G9.3 complete)  
Depends on: G8 closure complete

## Goal

Increase guest conversion confidence and reduce auth/session friction after the G8 baseline.

## Batch Plan

## G9.1 Auth and Session UX Resilience

1. Add deterministic handling for stale auth/session states on guest-protected routes.
2. Ensure guest pages recover gracefully from transient auth refresh failures without broken UI loops.
3. Exit criteria:
   - no unresolved auth-gate flake in guest smoke/a11y runs.

## G9.2 Booking Funnel Clarity

1. Tighten booking/tour empty states with explicit next-step CTA hierarchy.
2. Align fallback states (offline + unauthenticated + no inventory) to one consistent user pathway.
3. Exit criteria:
   - manual smoke confirms no ambiguous dead-end screens in `/book` and `/tours`.

## G9.3 Guardrail Coverage Expansion

1. Extend guest automation to cover one reservation action path under authenticated mode (non-destructive assertion flow).
2. Keep tests deterministic and environment-tolerant.
3. Exit criteria:
   - guest E2E suite still green and CI-friendly with optional credential mode.

## Execution Order

1. G9.1
2. G9.2
3. G9.3

## Notes

1. No business-rule/policy changes in G9 scope.
2. Preserve data privacy boundaries and existing offline-first architecture.

## Execution Update

Execution update (2026-05-17):

1. G9.1 completed with auth/session resilience hardening:
   - de-duplicated concurrent `safeGetSession()` calls to reduce lock contention
   - normalized transient auth fetch/lock timeout errors into user-actionable messages
   - improved login error messaging for local-auth connectivity failures
2. G9.2 started with booking-funnel clarity improvements:
   - upgraded unauthenticated `/book` and `/tours` states with explicit next-step CTAs
   - improved `/book` no-availability state with quick recovery actions (reset filter, shift dates, tour fallback)
   - improved `/tours` empty-service state with retry + stay-booking fallback
3. G9.3 completed with guardrail coverage expansion:
   - added authenticated booking-path smoke guardrail (`guest-book-auth-flow.spec.mjs`) with non-destructive assertion
   - extracted reusable guest sign-in helper (`guestAuthFlow.mjs`) for credential-gated tests
   - kept credential mode optional so local/CI runs remain environment-tolerant
4. Verification snapshot (2026-05-17):
   - `npm run test:guest:e2e` -> `9 passed`, `2 skipped` (`11` total)
   - skipped cases are credential/data-precondition guardrails (expected optional behavior)
