# Guest UX Improvement Plan

Last updated: 2026-04-25  
Status: In progress  
Scope: Next.js guest experience refinement only (no business-rule changes)

## Objective

Improve clarity, speed-to-task, and trust in core guest journeys while preserving existing API/data behavior.

## Baseline

Current guest modules are already feature-complete and operational:

1. Booking: `/book`, `/tours`
2. Booking management: `/my-bookings`
3. Stay + QR: `/guest/my-stay`
4. Offline map and services: `/guest/map`, `/guest/services`
5. Profile + sync center: `/guest/profile`, `/guest/sync`

Recent cleanup already improved technical UX foundations:

1. Shared response contracts for guest map and bookings flows.
2. Standardized API error normalization in guest modules.
3. SSR bootstrap consistency using shared server API helper.

## Guardrails

1. Do not alter reservation/payment/deposit business rules.
2. Do not change security/privacy boundaries (PII off-chain remains required).
3. Keep offline-first behavior intact for map, stay, and sync scenarios.
4. Prefer shared UI primitives and consistent state patterns.

## Execution Batches

### G1 - Guest UX Audit and Backlog

Deliverables:

1. Route-by-route friction inventory with severity tags.
2. Copy clarity review for payment/deposit/cancellation/QR states.
3. Mobile-first interaction audit (320px+ and touch-first controls).
4. Prioritized implementation backlog with low-risk quick wins first.

Target files to inspect:

1. `hillside-next/components/book/BookNowClient.tsx`
2. `hillside-next/components/tours/ToursBookingClient.tsx`
3. `hillside-next/components/my-bookings/MyBookingsClient.tsx`
4. `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
5. `hillside-next/components/guest-stay/GuestOfflineQrCard.tsx`
6. `hillside-next/components/guest-map/GuestMapClient.tsx`
7. `hillside-next/components/guest-services/GuestServicesClient.tsx`
8. `hillside-next/components/guest-profile/GuestProfileClient.tsx`
9. `hillside-next/components/layout/GuestChrome.tsx`

### G2 - Information and Copy Consistency

Focus:

1. Align wording across booking, payment, and cancellation states.
2. Normalize action labels and button hierarchy across guest pages.
3. Make next-step instructions explicit after successful and failed actions.

### G3 - Interaction and Visual Polish

Focus:

1. Reduce friction in booking and proof-submission flows.
2. Improve loading, empty, and recovery states for guest-critical screens.
3. Tighten spacing/visual hierarchy for mobile and tablet layouts.
4. Improve accessibility basics: focus order, aria labels, contrast, and tap targets.

### G4 - Offline Confidence and Trust

Focus:

1. Clarify queued-vs-sent state for offline actions.
2. Surface sync freshness and retry messaging in guest-facing language.
3. Improve QR readiness messaging for low-connectivity conditions.

### G5 - Validation and Closure

Deliverables:

1. Manual guest smoke evidence (online + offline scenarios).
2. Before/after screenshots for key journey screens.
3. UX acceptance checklist sign-off and follow-up backlog.

## Success Criteria

1. Guest can complete booking and payment-proof flows without ambiguity.
2. Guest can identify current reservation/payment/QR state in one scan.
3. Offline actions clearly communicate whether work is queued or synced.
4. Error messages are actionable and consistent across all guest routes.
5. Mobile usability issues (layout overflow, cramped actions, unclear hierarchy) are removed from priority screens.

## Out of Scope

1. New business features outside current guide scope.
2. Data-model or policy changes unrelated to UX clarity.
3. ZKP implementation (still design-roadmap only).

## Execution Updates

### G1 - Part 2 (Quick Wins Implemented)

1. Added route-level loading UI for guest-critical pages:
   - `hillside-next/app/book/loading.tsx`
   - `hillside-next/app/my-bookings/loading.tsx`
2. Improved `My Bookings` orientation and recovery affordances:
   - tab-context hint text per booking tab
   - persistent quick link to Sync Center
   - empty-state CTAs to `/book` and `/tours`
   - upgraded loading-state placeholders from plain text to skeleton cards
3. Kept scope UI-only:
   - no business-rule, API-contract, or policy logic changes

### G2 - Part 1 (Copy Consistency Started)

1. Aligned guest-facing microcopy across stay/bookings/services flows:
   - clearer check-in timing and QR action wording in `MyStayDashboardClient`
   - clearer online/offline service-request expectations and sync hint in `GuestServicesClient`
   - clearer payment-proof next-step and queued-action feedback styling in `MyBookingsClient`
2. Updated tone objective:
   - use direct action language and explicit next steps after user actions
   - reduce ambiguous status phrases in guest-critical paths
3. Kept scope UI-only:
   - no changes to reservation, payment, sync, or API business logic

### G3 - Part 1 (Interaction and Mobile Polish Started)

1. Improved booking interaction clarity in `BookNowClient`:
   - explicit blocker message when booking action is disabled
   - selected-unit counter and quick "clear selection" action
   - clearer selection state copy ("tap to remove")
2. Improved guest-services request interactions in `GuestServicesClient`:
   - retry controls for service and timeline load failures
   - touch-friendly quantity stepper controls (+/-)
   - estimated total price preview before submit
   - color-coded status badges in request timeline
3. Kept scope UI-only:
   - no changes to backend routes, payload shapes, or booking/payment policies

### G3 - Part 2 (Tours Interaction and Loading Polish)

1. Improved tour-booking interactions in `ToursBookingClient`:
   - disabled submit guidance with explicit blocker text
   - touch-friendly guest-count steppers for adults/kids
   - retry affordance for service list load failures
   - queued-vs-online success notice tone alignment with sync CTA
2. Added route-level loading shell:
   - `hillside-next/app/tours/loading.tsx`
3. Kept scope UI-only:
   - no changes to tour reservation, payment, or policy business logic

### G3 - Part 3 (Accessibility Pass)

1. Improved guest modal accessibility semantics across major guest flows:
   - `BookNowClient` gallery modal
   - `MyBookingsClient` detail/payment/QR/cancel/gallery modals
   - `GuestServicesClient` request modal
   - `MyStayDashboardClient` QR modal
2. Accessibility updates delivered:
   - added dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`)
   - improved status/error announcement semantics (`role="status"` / `role="alert"` in modal feedback)
3. Kept scope UI-only:
   - no business logic, API, or policy behavior changes

### G4 - Part 1 (Offline Confidence Messaging)

1. Added consistent offline guidance banners and sync pathways across guest flows:
   - `BookNowClient`
   - `ToursBookingClient`
   - `GuestServicesClient`
   - `MyStayDashboardClient`
2. Messaging updates delivered:
   - explicit "queued for sync" expectations while offline
   - direct `Open Sync Center` action in offline/queued contexts
   - unified tone between offline warnings and queued-success notices
3. Kept scope UI-only:
   - no changes to offline queue logic, APIs, or business rules

### G4 - Part 2 (Map/Profile/Sync Alignment)

1. Extended offline-guidance consistency to:
   - `GuestMapClient`
   - `GuestProfileClient`
   - `SyncCenter` guest experience
2. Messaging and action updates delivered:
   - map offline banner with explicit cached-data expectation and sync shortcut
   - profile offline banner plus disabled save/update actions while offline
   - sync-center offline guidance text aligned with queue-and-reconnect flow
3. Kept scope UI-only:
   - no data-model, API, or policy changes

### G5 - Part 1 (Validation Pack Prepared)

1. Added manual validation and evidence checklist:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
2. Prepared closure assets:
   - scenario matrix for booking/tours/stay/map/services/profile/sync
   - screenshot naming convention and evidence folder standard
   - sign-off table for final pass/fail tracking
3. Next step:
   - execute manual run and attach evidence links for closure sign-off

### G5 - Part 2 (Evidence Workspace Scaffolded)

1. Added evidence workspace assets:
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
   - `docs/re-architecture-core/evidence/guest-ux/manual-run-template.md`
2. Validation execution support delivered:
   - fixed filename checklist aligned with acceptance matrix evidence rows
   - manual run table template with pass/fail + notes + follow-up fields
3. Next step:
   - execute manual scenarios and fill `manual-run-template.md` for final sign-off.

### G3 - Part 4 (Loading-State Coverage Parity)

1. Added missing route-level loading shell for guest sync flow:
   - `hillside-next/app/guest/sync/loading.tsx`
2. UX polish delivered:
   - consistent skeleton-first load experience before Sync Center content resolves
   - parity with other guest-critical routes already using explicit loading surfaces
3. Kept scope UI-only:
   - no sync queue logic, API behavior, or policy rules changed.

### G5 - Part 3 (Preflight Validation Gate)

1. Ran integrated quality gate before manual UX sign-off:
   - `npm run quality:gate`
2. Validation result:
   - lint pass
   - typecheck pass
   - API tests pass (`95 passed`)
   - DB validation pass (`checked_files: 70`, zero hygiene waivers)
3. Next step:
   - execute G5 manual route scenarios and attach screenshot evidence in `docs/re-architecture-core/evidence/guest-ux/`.

### G5 - Part 4 (Manual-Run Bootstrap Helper)

1. Added helper script for faster manual evidence execution startup:
   - `docs/re-architecture-core/scripts/prepare-guest-ux-manual-run.ps1`
2. Helper output:
   - creates dated run sheet from `manual-run-template.md`
   - auto-fills run date and tester name
3. Next step:
   - run helper and execute scenario matrix in the generated run sheet.

### G5 - Part 5 (Closure Summary Scaffolded)

1. Added closure summary template:
   - `docs/re-architecture-core/evidence/guest-ux/g5-closure-summary-template.md`
2. Added checklist/readme linkage for closure handoff:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
3. Next step:
   - fill manual run sheet + evidence, then finalize closure summary and mark P4 completion decision.

### G3 - Part 5 (Shared Sync Banner Consolidation)

1. Added reusable sync-feedback primitive:
   - `hillside-next/components/shared/SyncAlertBanner.tsx`
2. Replaced repeated inline offline/queued/success banner markup in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
3. Outcome:
   - consistent guest sync/offline messaging styles with reduced duplicate JSX branches.
