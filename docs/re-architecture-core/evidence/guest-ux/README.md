# Guest UX Evidence Pack

Last updated: 2026-04-25  
Purpose: store G5 manual-validation screenshots and notes for guest UX closure.

## Required Captures

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

## Optional Captures

1. `g5-11-booking-modal-a11y.png`
2. `g5-12-services-modal-a11y.png`
3. `g5-13-my-bookings-modal-a11y.png`

## Run Notes

1. Use `manual-run-template.md` in this folder to record pass/fail and notes.
2. Keep filenames stable so plan/checklist references remain valid.
3. Optional helper command (from repo root) to create dated run sheet:
   - `powershell -ExecutionPolicy Bypass -File docs/re-architecture-core/scripts/prepare-guest-ux-manual-run.ps1 -Tester "Your Name"`
4. Use `g5-closure-summary-template.md` to prepare final acceptance decision notes.
5. Link this evidence folder in:
   - `docs/re-architecture-core/16-guest-ux-improvement-plan.md`
   - `docs/re-architecture-core/14-cleanup-baseline-inventory.md`
