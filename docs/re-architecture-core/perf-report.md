# Performance Report (Initial Baseline)

Last updated: 2026-02-26

## Top 10 slow endpoints (baseline hypotheses)

1. `GET /v2/reservations` — wide joins + optional search scan.
2. `GET /v2/payments` — admin filters + reservation joins.
3. `GET /v2/audit/logs` — large log table, timestamp sort.
4. `GET /v2/reports/transactions` — date range filters + joins.
5. `GET /v2/me/bookings` — cursor + client-side filtering.
6. `GET /v2/units` — admin list + search.
7. `GET /v2/dashboard/summary` — multiple list queries + report RPC.
8. `GET /v2/catalog/services` — read-heavy lookup.
9. `GET /v2/catalog/units/available` — RPC + availability checks.
10. `GET /v2/reservations/{id}` — detail fetch with nested relations.

## Top 10 slow pages (baseline hypotheses)

1. `/admin/reservations` — table + search + pagination.
2. `/admin/payments` — payment review list.
3. `/admin/audit` — log table.
4. `/admin/reports` — charts + reporting range.
5. `/admin/units` — media-heavy card grid.
6. `/my-bookings` — cursor paging.
7. `/guest` — summary + quick actions.
8. `/book` — availability RPC + unit cards.
9. `/tours` — services + availability.
10. `/admin/scan` — QR preview + token verification.

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

1. Hit `/v2/dashboard/perf` after representative page navigation.
2. Capture the slowest API entries + p95 values.
3. Replace hypotheses above with measured top-10 list.

