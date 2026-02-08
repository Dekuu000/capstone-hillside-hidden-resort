# Project Map - Hillside Hidden Resort Capstone

## Goal
PWA reservation + payments + QR check-in/out + reports + audit logs (blockchain-ready).

## Tech Stack
React + TypeScript + Vite + Tailwind, Supabase (Postgres/Auth/Storage), PWA plugin, QR scan libs.

## Folder Overview
- src/
  - lib/        (supabase client, helpers)
  - features/   (auth, units, reservations, services, payments)
  - components/ (shared UI)
  - pages/      (routes)
  - styles/
- supabase/
  - migrations/ (schema + RPCs)

## Current Phase
Phase 4 complete. Next: Phase 5 (QR check-in/out).

## Recently Completed
- Phase 3: reservations + availability engine + atomic overlap prevention
- Ticketed tours: services + service_bookings
- Payments: payments table, proof uploads, admin verification, on-site payments
- Flexible deposit: expected pay-now + payment intent update RPC
- Guest cancellation RPC + stricter reservation update policy
- Admin/guest UI refinements for balances and payment summaries

## Business Rules (Non-negotiables)
- Availability overlap: new_in < existing_out AND new_out > existing_in
- Status flow: pending_payment -> for_verification (after proof upload) -> confirmed (after admin verifies)
- Unit deposit rules (primary unit, admin override allowed):
  - Cottage: 500
  - Room: 1000
  - Pavilion / Function Hall: 1000
- Tours-only advance deposit:
  - total_amount = adult_qty * adult_rate + kid_qty * kid_rate
  - min_deposit = min(500, total_amount)
  - pay_now in [min_deposit, total_amount]
  - pay_now == total_amount => full payment, else deposit
- Tours attached to unit reservation: no extra tour deposit; use unit rules
- Tours-only dates: check_in_date = visit_date, check_out_date = visit_date + 1 (exclusive end-date)
- Guests can only create advance tours; walk-in tours are admin-only
- On-site balance: recorded as on_site payment at check-in

## Key Files to Read First
- Supabase client: `src/lib/supabase.ts`
- Auth / role guard: `src/components/ProtectedRoute.tsx`
- Availability + reservation logic: `src/features/reservations/useReservations.ts`
- Services (tours) hooks: `src/features/services/useServices.ts`
- Payments hooks: `src/features/payments/usePayments.ts`
- Tour pricing helpers: `src/lib/tourPricing.ts`
- Routing entry: `src/App.tsx`
- Guest tour booking: `src/pages/GuestTourBookingPage.tsx`
- Admin tour booking: `src/pages/AdminTourBookingPage.tsx`
- My Bookings: `src/pages/MyBookingsPage.tsx`
- Reservation details: `src/pages/ReservationDetailsPage.tsx`
- Payments list: `src/pages/PaymentsPage.tsx`
- Admin payment verification guide: `docs/ADMIN_PAYMENT_VERIFICATION.md`

## Commands
- npm install
- npm run dev
- npm run build

## Key Routes
- /book (guest units)
- /tours (guest tours)
- /my-bookings (guest bookings + payment proof)
- /admin/tours/new (admin walk-in tours)
- /admin/reservations (admin list)
- /admin/reservations/:id (reservation details + on-site payment)
- /admin/payments (payments review)

## File Tree (Top-Level Highlights)
```
hillside-app
  docs/
    PROJECT_MAP.md
    UI_RULES.md
    PROJECT_STATUS.md
  src/
    pages/
      AdminDashboard.tsx
      AdminTourBookingPage.tsx
      GuestBookingPage.tsx
      GuestTourBookingPage.tsx
      MyBookingsPage.tsx
      PaymentsPage.tsx
      ReservationDetailsPage.tsx
    features/
      reservations/
      services/
      payments/
  supabase/
    migrations/
      20260207_010_update_create_reservation_atomic.sql
      20260207_011_create_services_and_bookings.sql
      20260207_013_create_payments_table.sql
      20260207_014_payment_functions.sql
      20260207_015_update_deposit_rules.sql
      20260207_016_payment_proofs_storage.sql
      20260207_017_record_on_site_payment.sql
      20260207_018_update_payment_functions.sql
      20260207_019_create_tour_reservation_atomic.sql
      20260207_020_update_tour_reservation_auth.sql
      20260207_021_fix_tour_reservation_atomic.sql
      20260207_022_fix_tour_reservation_status_ambiguity.sql
      20260207_023_enforce_advance_only_for_guests.sql
      20260207_024_cancel_reservation_rpc.sql
      20260207_025_restrict_reservations_update_policy.sql
      20260207_026_update_tour_deposit_rules.sql
      20260207_027_update_submit_payment_flexible_deposit.sql
      20260207_028_add_expected_pay_now.sql
      20260207_029_update_payment_intent_amount.sql
```
