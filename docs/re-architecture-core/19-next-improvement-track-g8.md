# G8 Next Improvement Track

Last updated: 2026-05-17  
Status: Completed (baseline closed)  
Depends on: G5 scenario matrix + accessibility spot-check closure (done)

## Goal

Improve guest UX quality beyond functional completion by adding accessibility automation, perceived-performance polish, and offline-confidence measurability.

## Batch Plan

## G8.1 Accessibility Automation

1. Add Playwright assertions for:
   - guest modal `role="dialog"` + `aria-modal="true"`
   - keyboard reachability for close + primary actions
2. Integrate into existing guest E2E command:
   - `npm run test:guest:e2e`
3. Exit criteria:
   - new accessibility assertions pass locally and in quality gate workflow.

Execution update (2026-05-09):

1. Completed:
   - guest a11y smoke route expansion to `/guest/services` and `/guest/map`
   - associated test stability updates for auth-gated route behavior
   - added modal keyboard/semantics guardrail spec:
     - `hillside-next/tests/guest-e2e/guest-modal-a11y.spec.mjs`
     - covers dialog semantics, keyboard containment, Escape close, and focus return
   - accessibility fixes for map controls/tabs and login link contrast
2. Validation:
   - `npm run test:guest:e2e` -> pass with modal guardrail coverage (`10 passed` with guest credentials set)
   - `npm run quality:gate` -> pass
3. Status:
   - `G8.1` complete

## G8.2 Perceived-Performance Polish

1. Review loading/empty transitions on:
   - `/book`
   - `/my-bookings`
   - `/guest/services`
2. Remove visible layout jumps and tighten recovery copy.
3. Exit criteria:
   - no major layout shift observed in manual smoke capture for the three routes.

Execution update (2026-05-09):

1. Started:
   - reserved top feedback rails on `/book`, `/my-bookings`, and `/guest/services`
2. Delivered:
   - reduced stacked alert/badge reflow by introducing stable min-height message areas
   - added min-height stabilization for core content regions on `/book`, `/my-bookings`, and `/guest/services`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run test:guest:e2e` -> pass (`9 passed`)
   - `npm run quality:gate` -> pass
4. Status:
   - `G8.2` complete

## G8.3 Offline Confidence Telemetry

1. Add lightweight counters or event logs for:
   - queued guest action
   - synced guest action
   - failed replay requiring retry
2. Surface a small summary in sync-center debug/admin view (non-PII).
3. Exit criteria:
   - we can report queued:sent:failed ratio from local run evidence.

Execution update (2026-05-09):

1. Completed:
   - added persistent offline replay telemetry counters in IndexedDB:
     - `queued_actions`
     - `synced_actions`
     - `failed_actions`
     - `last_event_at`
   - wired counter updates into sync flow:
     - queue event increments `queued_actions`
     - successful push replay increments `synced_actions`
     - failed replay increments `failed_actions`
   - surfaced non-PII telemetry summary in Sync Center:
     - success-rate badge
     - queued/synced/failed totals
     - last telemetry event timestamp
2. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run test:guest:e2e` -> pass (`9 passed`)
   - `npm run quality:gate` -> pass
3. Status:
   - `G8.3` complete

## Execution Order

1. G8.1 (first)
2. G8.2
3. G8.3

## Notes

1. Keep behavior/business rules unchanged.
2. Keep data privacy boundary unchanged (no PII in telemetry).

## Closure Summary

1. G8.1 / G8.2 / G8.3 all complete and validated.
2. Guest UX baseline is now documented with:
   - manual matrix evidence (`14/14` pass)
   - automation guardrail outcomes (`10 passed` with credentials)
   - green quality gate snapshot
3. Next improvements should continue under a new post-G8 track to avoid mixing closure records with future enhancements.
