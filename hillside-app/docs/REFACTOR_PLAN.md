# Refactor Plan v2 (Safe / Non-Ripple)

Last updated: 2026-02-09  
Scope: safe cleanup only (no schema, no business logic, no UI/UX layout changes)

## Goals
- Keep behavior identical
- Reduce dead code and obvious duplication
- Improve maintainability without altering output

## Guardrails
- Do not touch DB schema or RPC behavior
- Do not change text, spacing, classes, or component layout
- No route changes
- If a change risks behavior drift, skip it

## Slice Plan (Shippable)

### Slice 1 - Dead Code + Unused Exports
Actions:
- Remove clearly unused helper exports (no references)
- Remove unused imports where verified safe
Tests:
- npm run build
- Smoke: /admin/reservations/:id and /tours

### Slice 2 - Formatting Access Layer
Actions:
- Ensure money/date formatting only uses shared formatter entrypoint
- No formatter behavior changes
Tests:
- Spot-check money and dates in guest/admin

### Slice 3 - Service Call Consistency
Actions:
- Align service function signatures with current usage
- No query shape changes
Tests:
- Admin payments list, reservation details, guest bookings

### Slice 4 - Small UI Helpers (Read-only)
Actions:
- Extract pure render helpers only if identical output
- No className edits or markup changes
Tests:
- Visual pass on Reservations list and Details page

### Slice 5 - Type Cleanup
Actions:
- Consolidate duplicate type aliases
- No type shape changes
Tests:
- npm run build

## Stop Condition
After each slice, stop for review before continuing.
