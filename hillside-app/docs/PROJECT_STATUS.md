# Project Status - Hillside Hidden Resort

Last updated: 2026-02-13

## Where We Are Now
Phase 5 (QR check-in/out) is complete and stable. Phase 6 (Audit + Reports + Insights) is complete and merged. Phase 7 (Blockchain Anchoring) is implemented and working with manual anchoring. JWT verification is temporarily disabled for demo stability (Option A). Phase 8 (Analytics + AI) is in progress with reporting RPCs and reports UI wired; validation and polish are underway.

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
- Phase 7 anchoring: audit_anchors table + anchor_id links, anchor-audit edge function (Sepolia), /admin/audit anchor controls (Anchor now / Confirm status / Verify DB)
- Phase 8 analytics: daily/monthly/summary report RPCs + reports UI (summary cards, charts, CSV exports, rule-based insights)

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
- audit_anchors (Phase 7 root hash batches)

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
- validate_qr_checkin (admin scan validation)
- perform_checkin / perform_checkout (admin check-in/out)

## UI/UX State (Guest)
- Tours page: Payment Summary card (Total / Pay now / Pay later) with preset buttons + custom amount
- Book Now (units): same pay-now controls with min/max enforcement
- My Bookings: editable amount before proof submission; locked after proof upload
- Helper text: clear deposit rules and balance on-site messaging
- QR visibility: shown only when confirmed or balance_due == 0; otherwise locked

## Next Steps (Phase 8)
1. Validate report RPCs (SQL Editor admin-claims test) and /admin/reports UI
2. Verify CSV exports (Summary + Transactions)
3. Final Phase 8 regression + docs update
4. Optional: re-enable Verify JWT for anchor-audit once auth is stable

## Phase 8 Planning
- See `docs/PHASE8_ANALYTICS_PLAN.md` for the detailed Analytics + AI plan.

## Sprint Backlog (Phase 6)
Sprint 1: Audit Trail
- Confirm audit event coverage (reservation, payment, check-in/out, override)
- Document hash payload rules
- Add audit snippet in Reservation Details
- Build /admin/audit page

Sprint 2: Reporting + CSV
- Reports UI with date range filters
- Summary cards (revenue, bookings, cancellations)
- Export Summary CSV
- Optional Transactions CSV (no PII)

Sprint 3: Rule-Based Insights
- Add deterministic insights (peaks, anomalies)
- Empty-state handling

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
