# Project Status - Hillside Hidden Resort

Last updated: 2026-02-08

## Where We Are Now
Phase 4 (Payments + Tours) is complete. Core payment flows, tour booking, flexible deposits, and payment verification UX are implemented end-to-end. Next: Phase 5 (QR check-in/out).

## Completed Work (Summary)
- Phase 3 reservations: atomic availability checks, overlap prevention, reservation_units tracking
- Units: unique constraint + idempotent seed + duplicate cleanup
- Tours: services + service_bookings, day/night pricing, guest advance-only tours
- Payments: payments table, proof upload (GCash), admin verification, on-site payments
- Flexible deposits: guests can pay above minimum up to total, with balance on-site
- Payment intent updates: guests can change pay-now amount before proof upload
- Guest self-service: My Bookings view, cancel eligible reservations, submit proof
- Admin UX: payment proof viewing, pending/verified clarity, remaining balance shown
- UI consistency: shared formatting for currency and dates

## Core Business Rules
Reservations:
- Overlap: new_in < existing_out AND new_out > existing_in
- Status: pending_payment -> for_verification (after proof upload) -> confirmed (after admin verification)
- Cancel/no_show/checked_out are terminal for payment submission

Unit Deposits (primary unit rules):
- Cottage: 500
- Room: 1000
- Pavilion / Function Hall: 1000
- Admin can override deposit

Tours (ticketed services):
- total_amount = adult_qty * adult_rate + kid_qty * kid_rate
- min_deposit = min(500, total_amount)
- pay_now in [min_deposit, total_amount]
- pay_now == total_amount => full payment
- Guests can only create advance tours; walk-in tours are admin-only
- Tours-only dates: check_in_date = visit_date, check_out_date = visit_date + 1
- Tours attached to unit reservations do not add extra deposit

Payments:
- Proof submission required for guests (GCash)
- Reservation moves to for_verification after proof upload
- Admin verifies payments; confirmation requires verified payments >= minimum deposit (or full amount for full payment)
- Remaining balance is collected on-site via on_site payment

## Data Model Highlights
Tables:
- services, service_bookings (ticketed tours)
- payments (deposit/full/on_site/refund)
- reservations.expected_pay_now (guest-selected amount)

Storage:
- Supabase Storage bucket: payment-proofs (private)
- Guests can upload to payments/{user_id}/... only

## Key RPCs
- create_reservation_atomic (units)
- create_tour_reservation_atomic (tours-only)
- submit_payment_proof (guest proof submission with flexible deposit)
- update_payment_intent_amount (guest adjusts pay-now before proof)
- record_on_site_payment (admin)
- cancel_reservation (guest)

## UI/UX State (Guest)
- Tours page: Payment Summary card (Total / Pay now / Pay later) with preset buttons + custom amount
- Book Now (units): same pay-now controls with min/max enforcement
- My Bookings: editable amount before proof submission; locked after proof upload
- Helper text: clear deposit rules and balance on-site messaging

## Next Steps (Phase 5+)
1. QR check-in/out (admin scan)
2. Offline-first scan queue + sync reconciliation
3. Reports + CSV export
4. Blockchain audit hashing (no PII)
5. AI insights (duplicate detection, peak forecasting)

## Sprint Backlog (Suggested)
Sprint 1: QR Check-in MVP
- Implement admin QR scan page workflow (scan -> validate -> check-in/out)
- Add reservation validation RPC for scan (status + date window + payment state)
- Write check-in logs (units + tours via reservation)
- Admin UI: success/failure states + retry

Sprint 2: Offline-First Scan Queue
- Local queue for scans when offline
- Sync worker to push queued scans when online
- Conflict handling (already checked-in/out)
- Admin UI: queued count + sync status

Sprint 3: Reporting
- Report filters (date range, unit/tour)
- CSV export
- Summary cards (revenue, occupancy, guests)

Sprint 4: Blockchain Audit
- Hash critical actions only (no PII)
- Store tx hash references in audit_logs metadata
- Admin UI: audit log viewer

## Decision Log (Key Product/Engineering)
- 2026-02-07: Tours are ticketed services (services/service_bookings), not units.
- 2026-02-07: Guests can only create advance tours; walk-in tours are admin-only.
- 2026-02-07: Tours-only dates use check_in = visit_date, check_out = visit_date + 1.
- 2026-02-07: Tour deposit rule is min(500, total_amount).
- 2026-02-07: Flexible pay-now allowed; guests can pay above minimum up to total.
- 2026-02-07: Payment status moves to for_verification only after proof upload.
- 2026-02-07: Use Supabase Storage for payment proof files (private bucket).

## Risks / Dependencies
QR + Offline:
- Camera permissions and device variability across Android/iOS browsers
- Offline scan queue consistency; must reconcile conflicts on reconnect
- Real-time validation requires stable connectivity; offline fallback must not bypass server rules

Payments:
- Proof upload security: ensure signed URLs are used for viewing
- Prevent duplicate pending payments per reservation
- Admin verification rules must remain strict and auditable

Data Integrity:
- Ensure flexible pay-now does not break minimum deposit enforcement
- Confirm tour + unit reservations do not double-charge deposit

Delivery Dependencies:
- Final GCash account details from resort
- Admin policy confirmation for cancellation windows/refunds

## Known Constraints / Notes
- Manual admin confirmation remains the default policy
- Tours-only advance deposits: full payment required when total <= 500
- For tour bookings with units, only the primary unit deposit rules apply
