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

### G3 - Part 6 (Online-State Hook Consolidation)

1. Added shared network-state hook:
   - `hillside-next/lib/hooks/useNetworkOnline.ts`
2. Replaced repeated online/offline event wiring in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
   - `hillside-next/components/guest-stay/GuestOfflineQrCard.tsx`
   - `hillside-next/components/shared/NetworkStatusBadge.tsx`
3. Outcome:
   - reduced duplicated connectivity listener logic while keeping existing guest UX behavior unchanged.

### G3 - Part 7 (Modal Shell Consolidation)

1. Added shared modal wrapper primitive:
   - `hillside-next/components/shared/ModalDialog.tsx`
2. Replaced repeated modal shell/header/close scaffolding in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - (details modal, payment-proof modal, QR modal, cancel modal)
3. Outcome:
   - fewer repeated modal structure branches with consistent dialog semantics in guest bookings flows.

### G3 - Part 8 (Modal Shell Reuse Expansion)

1. Extended shared modal shell reuse to:
   - `hillside-next/components/book/BookNowClient.tsx` (unit gallery modal)
   - `hillside-next/components/guest-services/GuestServicesClient.tsx` (service request modal)
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx` (check-in QR modal)
2. Alignment improvements delivered:
   - unified overlay/dialog semantics and close affordance via `ModalDialog`
   - removed repeated wrapper/header/close button JSX branches in guest-critical flows
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 9 (Inset Card/List Primitive Consolidation)

1. Added shared inset card/list primitive:
   - `hillside-next/components/shared/InsetPanel.tsx`
2. Replaced repeated guest card/list wrapper markup in:
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 10 (Segmented Filter/Tab Control Consolidation)

1. Extended shared tab primitive flexibility:
   - `hillside-next/components/shared/Tabs.tsx`
   - added `ariaLabel`, `mobileMode`, and tab style override hooks for reuse across layouts
2. Replaced guest-local segmented/filter controls with shared tabs in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx` (booking status segmented tabs)
   - `hillside-next/components/guest-map/GuestMapClient.tsx` (amenity kind filter chips)
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 11 (Currency Formatter Consolidation)

1. Added shared PHP currency formatter utility:
   - `hillside-next/lib/formatCurrency.ts`
2. Replaced duplicated guest-local currency formatters in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 12 (JWT Subject Parser Consolidation)

1. Added shared JWT subject parser utility:
   - `hillside-next/lib/jwt.ts`
2. Replaced duplicated guest-local token parsing helper in:
   - `hillside-next/components/tours/ToursBookingClient.tsx`
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 13 (AI Source Helper Consolidation)

1. Added shared AI pricing-source helper:
   - `hillside-next/lib/aiPricing.ts`
2. Replaced duplicated guest-local helper in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 14 (ISO Date Helper Consolidation)

1. Added shared ISO-date utilities:
   - `hillside-next/lib/dateIso.ts`
2. Replaced duplicated guest-local date helpers in:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G3 - Part 15 (Date-Time Display Helper Consolidation)

1. Added shared date-time display helpers:
   - `hillside-next/lib/dateDisplay.ts`
2. Replaced duplicated guest-local date-time formatting logic in:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 1 (Guest Hero Visual Foundation)

1. Extended shared page header primitive to support hero style:
   - `hillside-next/components/layout/PageHeader.tsx`
   - added optional `variant="hero"`, `eyebrow`, and flexible `ReactNode` title/subtitle support
2. Applied hero-header consistency to high-traffic guest booking routes:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 2 (Form + CTA Visual Consistency)

1. Added shared guest form/CTA utility classes in global styling:
   - `hillside-next/app/globals.css`
   - `guest-form-label`, `guest-field-control`, `guest-stepper-btn`, `guest-toggle-pill`, `guest-primary-cta`
2. Applied consistent form control and primary CTA styling to:
   - `hillside-next/components/book/BookNowClient.tsx`
   - `hillside-next/components/tours/ToursBookingClient.tsx`
3. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 3 (Guest Control Surface Consistency)

1. Extended shared guest visual utilities for control surfaces:
   - `hillside-next/app/globals.css`
   - added `guest-secondary-cta`, `guest-secondary-cta-sm`, `guest-surface-soft`
2. Applied the shared control/CTA/form language to guest high-traffic management flows:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/guest-stay/MyStayDashboardClient.tsx`
   - `hillside-next/components/guest-services/GuestServicesClient.tsx`
3. UX alignment delivered:
   - consistent primary/secondary action hierarchy across bookings, stay QR, and guest services
   - consistent form field + stepper + toggle styling in payment and service-request dialogs
   - consistent soft-surface messaging blocks for payment/service context hints
4. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 4 (Map + QR + Sync Surface Consistency)

1. Extended shared visual utility usage in additional guest-critical surfaces:
   - `hillside-next/components/guest-map/GuestMapClient.tsx`
   - `hillside-next/components/guest-stay/GuestOfflineQrCard.tsx`
   - `hillside-next/components/shared/SyncCenter.tsx`
2. UX consistency updates delivered:
   - aligned map origin selector and cached/error feedback blocks with shared guest field/surface styles
   - aligned guest check-in QR action buttons with shared primary/secondary CTA hierarchy
   - aligned sync-center action buttons and summary cards with shared CTA/surface language
3. Scope safety:
   - no sync-engine, queueing, API, or policy behavior changes
4. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 5 (Profile + Navigation Surface Consistency)

1. Applied shared visual utility alignment to remaining guest shell/profile surfaces:
   - `hillside-next/components/layout/GuestChrome.tsx`
   - `hillside-next/components/guest-profile/GuestProfileClient.tsx`
2. UX consistency updates delivered:
   - aligned top-right guest menu trigger with shared secondary CTA treatment
   - aligned profile-menu summary card and repeated menu-item row styling via shared utility classes
   - aligned guest profile security cards with shared soft-surface treatment
3. Scope safety:
   - no auth/session, wallet-linking logic, API contract, or policy behavior changes
4. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 6 (Destructive Action + Status Pill Consistency)

1. Extended shared guest utility classes for final action/status polish:
   - `hillside-next/app/globals.css`
   - added `guest-danger-cta`, `guest-danger-cta-sm`, and `guest-status-pill`
2. Applied these utilities to remaining guest-critical controls:
   - `hillside-next/components/my-bookings/MyBookingsClient.tsx`
   - `hillside-next/components/shared/SyncCenter.tsx`
3. UX consistency updates delivered:
   - aligned destructive actions (cancel/discard) to one consistent danger-button language
   - aligned table/list status chips to one consistent status-pill visual treatment
   - removed final ad-hoc button styling branches in bookings detail/gallery/cancel actions
4. Scope safety:
   - no booking logic, sync behavior, API contract, or policy changes
5. Validation:
   - `npm run test:guest:e2e` -> pass (`7 passed`)
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 7 (Guest Navigation Pill Consistency)

1. Extended shared guest utility classes for nav controls:
   - `hillside-next/app/globals.css`
   - added `guest-nav-pill` and `guest-nav-pill-sm`
2. Applied shared nav-pill treatment to guest chrome navigation:
   - `hillside-next/components/layout/GuestChrome.tsx`
3. UX consistency updates delivered:
   - aligned desktop top-nav item shape/active state with shared guest visual language
   - aligned mobile bottom-nav chips with the same active/inactive hierarchy and tap target feel
4. Scope safety:
   - no routing/auth/session/wallet logic changes
5. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G6 - Part 8 (Closeout Readiness and A11y Handoff)

1. Added guest-nav accessibility enhancement:
   - `hillside-next/components/layout/GuestChrome.tsx`
   - active nav links now set `aria-current="page"` for clearer screen-reader route context
2. Prepared G6-to-G5 handoff evidence scaffolding:
   - `docs/re-architecture-core/17-guest-ux-acceptance-checklist.md`
   - `docs/re-architecture-core/evidence/guest-ux/manual-run-template.md`
   - `docs/re-architecture-core/evidence/guest-ux/README.md`
3. Handoff improvements delivered:
   - optional visual-regression quick checks added for nav/CTA/form/sync surfaces
   - optional G6 screenshot naming guidance added to evidence pack
4. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass

### G7 - Part 1 (Automation Guardrails Scaffold)

1. Added Playwright + axe smoke-automation scaffold for guest UX:
   - `hillside-next/playwright.guest.config.mjs`
   - `hillside-next/tests/guest-e2e/guest-smoke.spec.mjs`
   - `hillside-next/tests/guest-e2e/guest-a11y.spec.mjs`
2. Added runnable scripts:
   - `package.json` -> `test:guest:e2e`
   - `hillside-next/package.json` -> `test:e2e:guest`, `test:e2e:guest:headed`
3. Added automation runbook:
   - `docs/re-architecture-core/18-guest-ux-automation-guardrails.md`
4. Scope safety:
   - no business logic, API contract, or policy behavior changes
5. Validation:
   - `npm --prefix hillside-next run lint` -> pass
   - `npm --prefix hillside-next run typecheck` -> pass
   - `npm run quality:gate` -> pass
