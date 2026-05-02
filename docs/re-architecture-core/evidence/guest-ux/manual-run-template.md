# G5 Manual Run Template

Date: YYYY-MM-DD  
Tester:  
Environment: local dev stack (`db:start`, `dev:api`, `dev:next`)

## Scenario Results

| # | Route | Scenario | Result (Pass/Fail) | Evidence File | Notes |
|---|---|---|---|---|---|
| 1 | `/book` | Online booking flow visible | Pending |  |  |
| 2 | `/book` | Offline mode banner + Sync Center shortcut | Pending |  |  |
| 3 | `/book` | Disabled submit blocker guidance | Pending |  |  |
| 4 | `/tours` | Stepper interactions + blocker text | Pending |  |  |
| 5 | `/tours` | Offline messaging clarity | Pending |  |  |
| 6 | `/my-bookings` | Loading + empty state behavior | Pending |  |  |
| 7 | `/my-bookings` | Payment modal semantics and next-step copy | Pending |  |  |
| 8 | `/my-bookings` | QR modal offline guidance | Pending |  |  |
| 9 | `/guest/my-stay` | Stay messaging + offline guidance | Pending |  |  |
| 10 | `/guest/map` | Cached/offline map confidence banner | Pending |  |  |
| 11 | `/guest/services` | Quantity/status/retry interactions | Pending |  |  |
| 12 | `/guest/services` | Queued request messaging | Pending |  |  |
| 13 | `/guest/profile` | Offline disabled actions | Pending |  |  |
| 14 | `/guest/sync` | Queue guidance clarity | Pending |  |  |

## Accessibility Spot Checks

| Check | Result (Pass/Fail) | Notes |
|---|---|---|
| Dialog semantics (`role="dialog"`, `aria-modal`) present | Pending |  |
| Status/error announcement roles are applied correctly | Pending |  |
| Keyboard reachability for close + primary actions | Pending |  |

## G6 Visual Regression Quick Check (Optional)

| # | Area | Check | Result (Pass/Fail) | Evidence File | Notes |
|---|---|---|---|---|---|
| V1 | Guest nav | Desktop + mobile nav pills keep consistent active state and focus behavior | Pending |  |  |
| V2 | CTA hierarchy | Primary/secondary/danger buttons are visually consistent across guest-critical routes | Pending |  |  |
| V3 | Forms | Shared input/select/toggle/stepper styling remains consistent across booking/service flows | Pending |  |  |
| V4 | Sync center | Status pills + conflict/discard actions remain clear on mobile | Pending |  |  |

## Follow-Ups

1. Open issue links for failed rows:
2. Owner:
3. Target date:
