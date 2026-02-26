import Link from "next/link";
import type { AuditLogsResponse } from "../../../../packages/shared/src/types";
import { auditLogsResponseSchema } from "../../../../packages/shared/src/schemas";
import { getServerAccessToken } from "../../../lib/serverAuth";

const PAGE_SIZE = 10;

function toIsoDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw || "1");
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function buildQuery(params: {
  action?: string;
  entityType?: string;
  anchored?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
}) {
  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.entityType) qs.set("entity_type", params.entityType);
  if (params.anchored) qs.set("anchored", params.anchored);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.search) qs.set("search", params.search);
  qs.set("page", String(params.page || 1));
  return `?${qs.toString()}`;
}

async function fetchAuditLogs(
  accessToken: string,
  filters: {
    page: number;
    action?: string;
    entityType?: string;
    anchored?: string;
    from?: string;
    to?: string;
    search?: string;
  },
): Promise<AuditLogsResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  const offset = Math.max(0, (filters.page - 1) * PAGE_SIZE);
  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (filters.action) qs.set("action", filters.action);
  if (filters.entityType) qs.set("entity_type", filters.entityType);
  if (filters.anchored) qs.set("anchored", filters.anchored);
  if (filters.from) qs.set("from", `${filters.from}T00:00:00Z`);
  if (filters.to) qs.set("to", `${filters.to}T23:59:59Z`);
  if (filters.search) qs.set("search", filters.search);

  const response = await fetch(`${base}/v2/audit/logs?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const json = await response.json();
  const parsed = auditLogsResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const resolved = (await searchParams) ?? {};
  const action = (Array.isArray(resolved.action) ? resolved.action[0] : resolved.action) || "";
  const entityType = (Array.isArray(resolved.entity_type) ? resolved.entity_type[0] : resolved.entity_type) || "";
  const anchored = (Array.isArray(resolved.anchored) ? resolved.anchored[0] : resolved.anchored) || "";
  const fromDate = (Array.isArray(resolved.from) ? resolved.from[0] : resolved.from) || toIsoDate(-7);
  const toDate = (Array.isArray(resolved.to) ? resolved.to[0] : resolved.to) || toIsoDate(0);
  const search = (Array.isArray(resolved.search) ? resolved.search[0] : resolved.search) || "";
  const page = parsePage(Array.isArray(resolved.page) ? resolved.page[0] : resolved.page);

  const data = await fetchAuditLogs(accessToken, {
    page,
    action: action || undefined,
    entityType: entityType || undefined,
    anchored: anchored || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    search: search || undefined,
  });

  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-600">Filter and inspect audit trails through V2 API.</p>
      </header>

      <form method="get" className="mb-4 grid gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:grid-cols-6">
        <label className="grid gap-1 text-xs text-slate-600">
          Action
          <input
            type="text"
            name="action"
            defaultValue={action}
            placeholder="e.g., create"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          Entity
          <input
            type="text"
            name="entity_type"
            defaultValue={entityType}
            placeholder="e.g., reservation"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          Anchored
          <select name="anchored" defaultValue={anchored} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="anchored">Anchored</option>
            <option value="unanchored">Unanchored</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          From
          <input type="date" name="from" defaultValue={fromDate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          To
          <input type="date" name="to" defaultValue={toDate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          Search Entity ID
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="reservation_code / id"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="md:col-span-6 flex justify-end">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
            Apply Filters
          </button>
        </div>
      </form>

      {!data ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load audit logs. Verify API and admin session, then refresh.
        </p>
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-6 text-sm text-slate-600 shadow-sm">No audit logs found for current filters.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Performed By</th>
                  <th className="px-4 py-3 font-semibold">Anchored</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.audit_id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{formatDateTime(log.timestamp)}</td>
                    <td className="px-4 py-3">{log.action}</td>
                    <td className="px-4 py-3">{log.entity_type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-900">{log.entity_id}</td>
                    <td className="px-4 py-3">{log.performed_by?.name || log.performed_by?.email || "-"}</td>
                    <td className="px-4 py-3">
                      {log.anchor_id ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Anchored</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} | {totalCount} total
            </p>
            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  href={buildQuery({
                    action: action || undefined,
                    entityType: entityType || undefined,
                    anchored: anchored || undefined,
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    search: search || undefined,
                    page: page - 1,
                  })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">Previous</span>
              )}
              {canNext ? (
                <Link
                  href={buildQuery({
                    action: action || undefined,
                    entityType: entityType || undefined,
                    anchored: anchored || undefined,
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    search: search || undefined,
                    page: page + 1,
                  })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">Next</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
