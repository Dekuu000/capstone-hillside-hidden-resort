# Guest UX Acceptance Checklist

Last updated: 2026-04-25  
Owner: Guest UX track (G5)  
Status: Ready for manual run

## Purpose

Provide a single manual validation script and evidence template for the guest UX improvements completed in G1-G4.

## Preconditions

1. Local stack running:
   - `npm run db:start`
   - API server (`hillside-api`)
   - Next dev server (`hillside-next`)
2. A guest account that can sign in.
3. At least one guest reservation available for:
   - `/my-bookings`
   - `/guest/my-stay`
4. Browser DevTools available for offline simulation.

## Evidence Folder Convention

Store screenshots/log captures under:

1. `docs/re-architecture-core/evidence/guest-ux/`
2. Fill run results in:
   - `docs/re-architecture-core/evidence/guest-ux/manual-run-template.md`
3. Optional helper to generate a dated run sheet:
   - `powershell -ExecutionPolicy Bypass -File docs/re-architecture-core/scripts/prepare-guest-ux-manual-run.ps1 -Tester "Your Name"`

Recommended filename pattern:

1. `g5-01-book-online.png`
2. `g5-02-book-offline-banner.png`
3. `g5-03-my-bookings-empty-state.png`
4. `g5-04-my-bookings-queued-sync-banner.png`
5. `g5-05-my-stay-offline-banner.png`
6. `g5-06-map-offline-banner.png`
7. `g5-07-services-queued-banner.png`
8. `g5-08-profile-offline-disabled-actions.png`
9. `g5-09-sync-center-offline-guidance.png`
10. `g5-10-tours-stepper-and-blocker.png`

## Manual Scenario Matrix

| # | Route | Scenario | Pass Criteria | Evidence |
|---|---|---|---|---|
| 1 | `/book` | Online booking flow visible | Step cues and summary show clear action states | |
| 2 | `/book` | Offline mode | Offline banner appears with Sync Center shortcut | |
| 3 | `/book` | Disabled submit state | Blocker message explains why submit is disabled | |
| 4 | `/tours` | Interaction polish | Adult/Kid steppers work and blocker text appears when invalid | |
| 5 | `/tours` | Offline mode | Offline banner appears; queued behavior wording is clear | |
| 6 | `/my-bookings` | Loading/empty states | Skeleton loading and empty-state CTAs render correctly | |
| 7 | `/my-bookings` | Payment modal semantics | Dialog opens with accessible structure and clear next-step copy | |
| 8 | `/my-bookings` | QR modal offline path | Clear offline guidance and reconnect action text present | |
| 9 | `/guest/my-stay` | Stay dashboard messaging | Check-in wording is clear; offline guidance visible when offline | |
| 10 | `/guest/map` | Cached/offline map confidence | Offline banner explains cached behavior and sync path | |
| 11 | `/guest/services` | Request UX | Quantity controls, status badges, and retry controls work | |
| 12 | `/guest/services` | Queued request messaging | Queued/sync banner appears with Sync Center shortcut | |
| 13 | `/guest/profile` | Offline profile guardrails | Save/update actions disabled offline with reconnect copy | |
| 14 | `/guest/sync` | Sync center guidance | Offline queue guidance text is visible and understandable | |

## Accessibility Spot Checks

1. Dialogs expose `role="dialog"` and `aria-modal="true"` in guest flows.
2. Error and progress messages are announced using alert/status semantics.
3. Keyboard navigation can reach close buttons and primary actions in modals.

## Sign-Off Record

| Area | Result | Notes |
|---|---|---|
| Booking (`/book`) | Pending | |
| Tours (`/tours`) | Pending | |
| My Bookings (`/my-bookings`) | Pending | |
| My Stay (`/guest/my-stay`) | Pending | |
| Map (`/guest/map`) | Pending | |
| Services (`/guest/services`) | Pending | |
| Profile (`/guest/profile`) | Pending | |
| Sync (`/guest/sync`) | Pending | |

## Closure Criteria

1. All matrix rows marked pass with evidence links.
2. `manual-run-template.md` is filled and checked in with tester/date.
3. Any failed row converted into follow-up backlog items with owner/date.
4. Summary linked back into:
   - `docs/re-architecture-core/16-guest-ux-improvement-plan.md`
   - `docs/re-architecture-core/14-cleanup-baseline-inventory.md`
