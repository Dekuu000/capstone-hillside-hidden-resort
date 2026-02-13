# Phase 8 Plan - Analytics + AI (Rule-Based, Privacy-Safe)

Last updated: 2026-02-13

## Goal
Deliver admin-only analytics, reports, and rule-based insights that are useful for operations and safe for privacy.
No guest PII will be shown in analytics or exports.

## Scope (Phase 8)
1. Analytics Dashboard in `/admin/reports`
2. CSV Export
   - Summary CSV (default)
   - Transactions CSV (optional, no PII)
3. Rule-Based Insights (AI-lite)
   - Deterministic insights (no external model calls)

## Non-Negotiables
- No guest PII in analytics or CSVs.
- Aggregated metrics only.
- Reproducible totals across UI and CSV.
- No changes to existing business rules.

---

## Metrics (Proposed KPIs)
### Core KPIs
- Total Revenue (verified payments + on-site payments)
- Total Bookings (reservations count)
- Total Cancellations (cancelled status count)
- Occupancy Rate (units only, not tours)
- Tour vs Unit Revenue Split

### Operational KPIs
- Average Lead Time (days between booking date and check-in date)
- Average Length of Stay (nights)
- Peak Days (highest bookings or revenue)

---

## Data Sources (Aggregate Only)
Tables:
- `reservations`
- `payments`
- `service_bookings`
- `units` (for occupancy)
- `audit_logs` (optional for trends)

No fields like `guest_user_id`, `name`, `email`, `phone` are exposed in analytics.

---

## Step-by-Step Plan

### Step 0 - KPI Confirmation (Required)
Confirm final KPI list and definitions (revenue basis, occupancy formula, date granularity).

### Step 1 - Data Layer (SQL / RPCs)
Create read-only RPCs or views for:
- Daily revenue + booking counts
- Occupancy per day (units only)
- Tour ticket totals (adults + kids)
- Cancellations per day

### Step 2 - Reports UI (/admin/reports)
UI Cards:
- Revenue
- Bookings
- Cancellations
- Occupancy

Charts:
- Revenue over time
- Occupancy over time
- Tour vs Unit revenue split

Filters:
- Date range
- Category toggle (Units / Tours / All)

### Step 3 - CSV Export
Summary CSV (default):
- Date
- Bookings
- Revenue
- Cancellations
- Occupancy

Transactions CSV (optional):
- reservation_code
- total_amount
- amount_paid_verified
- balance_due
- status
- created_at

No guest fields.

### Step 4 - Rule-Based Insights
Example insights (deterministic):
- "Weekend bookings are higher than weekdays."
- "Cancellations increased in the last 7 days."
- "Night tours outperform day tours."

### Step 5 - QA and Regression
- Validate totals match between UI and CSV.
- Confirm no PII leaks.
- Check empty states (no data).

### Step 6 - Docs and Handoff
- Update `PROJECT_STATUS.md`
- Update `TEST_CHECKLIST.md`
- Add a short "How to interpret reports" note

---

## Acceptance Criteria
- Admin can view analytics and export CSVs.
- No guest PII appears in analytics or CSVs.
- Rule-based insights show meaningful summaries.
- All totals consistent across UI and CSV.

