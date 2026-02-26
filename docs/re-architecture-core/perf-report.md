# Performance Report (Measured Snapshot)

Last updated: 2026-02-26

Snapshot source: `/v2/dashboard/perf`

## Top 10 slow endpoints (p95, ms)

1. `GET /v2/escrow/reconciliation` — p95 19848.28 ms (on-chain reconciliation).
2. `GET /v2/reports/overview` — p95 4949.52 ms (report aggregation).
3. `GET /v2/payments` — p95 1093.31 ms (admin list + filters).
4. `GET /v2/reservations` — p95 1449.22 ms (admin list + joins).
5. `GET /v2/catalog/services` — p95 863.87 ms (services list).
6. `GET /v2/dashboard/perf` — p95 605.42 ms (metrics snapshot).
7. `GET /v2/audit/logs` — p95 424.43 ms (audit table).
8. `GET /v2/me/bookings` — p95 319.48 ms (guest bookings list).
9. `GET /v2/units` — p95 332.68 ms (units list).
10. `GET /v2/catalog/units/available` — p95 283.19 ms (availability RPC).

## DB timing highlights (p95, ms)

1. `db.escrow.reconciliation.page` — p95 1362.45 ms
2. `db.payments.list_admin.scan` — p95 1083.93 ms
3. `db.reservations.list_recent.page` — p95 416.39 ms
4. `db.services.list_active` — p95 465.71 ms
5. `db.audit.list.page` — p95 297.20 ms
6. `db.units.list_admin.page` — p95 325.13 ms

## Top pages (observed)

1. `/admin/reservations`
2. `/admin/payments`
3. `/admin/audit`
4. `/admin/reports`
5. `/admin/units`
6. `/my-bookings`
7. `/book`

## Changes applied in this pass

- API timings now capture all `/v2/*` routes.
- DB timing added for admin lists (payments, audit, units, services).
- Pagination enforced with offset/limit on list endpoints.
- Select payloads narrowed for services + AI forecast verification.
- New indexes: audit logs, check-in logs, payments created_at, service bookings date.
- TTL cache added for dashboard summary, units list, and catalog services.
- Frontend request timing + per-page request count logging in `apiClient`.
- Images migrated to `next/image` for optimized delivery.

## Next measurement steps

1. Re-run `/v2/dashboard/perf` after a full admin + guest navigation pass.
2. Compare p95 deltas against this baseline.
3. Add pagination/search index work if `db.payments.list_admin.scan` remains high.
