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
