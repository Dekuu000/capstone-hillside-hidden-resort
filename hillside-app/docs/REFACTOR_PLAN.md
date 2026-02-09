# Refactor Slice Plan (Pre‑Phase 6)

Last updated: 2026-02-09  
Scope: safe, incremental cleanup only (no schema or business‑rule changes)

## Top 10 Cleanup Targets
1. Repeated date formatting in pages (standardize usage)
2. Repeated currency formatting (ensure formatPeso used everywhere)
3. Duplicate payment summary logic across guest/admin pages
4. Inline validation/guard clauses duplicated in components
5. Inconsistent error handling (strings vs Error objects)
6. Mixed naming for payment amounts (pay_now, expected_pay_now)
7. Conditional UI states copied across pages (pending/verified badges)
8. Service layer query shape drift (reservations, payments, services)
9. Local UI utilities duplicated in pages (helper functions)
10. Unused imports/props and stale comments

## Minimal Structure Improvements (No big moves)
- `src/lib/` for pure helpers (formatting, date rules, pricing)
- `src/services/` for Supabase RPC/selects (single source of truth)
- `src/components/` for reusable UI (StatusBadge, MoneyRow, PaymentSummary)
- Avoid new folders unless necessary; prefer consolidating in-place

## Risk Assessment
- Low risk: removing unused imports/variables, formatting helpers
- Medium risk: moving logic into helpers (ensure return shapes unchanged)
- Higher risk: service query refactors (must not alter query fields)

Risk mitigation:
- Update only one slice at a time
- Manual test checklist after each slice
- Keep diffs small and reversible

## Slice Plan (Shippable Slices)

### Slice 1 — Dead Code + Imports (Low Risk)
Files: pages + components where unused imports/logs exist  
Actions:
- Remove unused imports
- Remove dead helper functions not referenced
Tests:
- npm run build
- Open /book, /tours, /my-bookings, /admin/payments

### Slice 2 — Shared Formatting Helpers
Files: `src/lib/` + pages  
Actions:
- Ensure all pages use `formatPeso`, `formatDateLocal`, `formatDateWithWeekday`
- Remove local formatting duplicates
Tests:
- Verify amounts + dates render correctly on guest/admin

### Slice 3 — Service Layer Normalization
Files: `src/services/*`, `src/features/*`  
Actions:
- Standardize return shapes (reservations/payments/services)
- Centralize Supabase error handling
Tests:
- Admin payment verify, guest proof submit, admin scan

### Slice 4 — UI Component Extraction
Files: `src/components/` + pages  
Actions:
- Extract shared UI blocks (PaymentSummaryRow, StatusBadge if duplicated)
- Replace duplicated JSX fragments
Tests:
- Visual check My Bookings + Reservation Details + Payments list

## Stop Condition
After each slice, stop for review before continuing to next.

## Notes
No DB schema or business rule changes permitted without explicit approval.
