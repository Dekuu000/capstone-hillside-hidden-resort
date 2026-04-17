import Link from "next/link";
import { ExternalLink, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { AuditLogsResponse } from "../../../../packages/shared/src/types";
import { auditLogsResponseSchema } from "../../../../packages/shared/src/schemas";
import { Badge, statusToBadgeVariant } from "../../../components/shared/Badge";
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

function toExplorerUrl(txHash: string) {
  if (!txHash) return null;
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

function buildQuery(params: {
  action?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
}) {
  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.search) qs.set("search", params.search);
  qs.set("page", String(params.page || 1));
  return `?${qs.toString()}`;
}

function toNumber(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number(raw || "1");
}

async function fetchAuditLogs(
  accessToken: string,
  filters: {
    page: number;
    action?: string;
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
  if (filters.from) qs.set("from", `${filters.from}T00:00:00Z`);
  if (filters.to) qs.set("to", `${filters.to}T23:59:59Z`);
  if (filters.search) qs.set("search", filters.search);

  const response = await fetch(`${base}/v2/audit/logs?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    next: { revalidate: 10 },
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
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Audit Logs</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const resolved = (await searchParams) ?? {};
  const action = (Array.isArray(resolved.action) ? resolved.action[0] : resolved.action) || "";
  const fromDate = (Array.isArray(resolved.from) ? resolved.from[0] : resolved.from) || toIsoDate(-7);
  const toDate = (Array.isArray(resolved.to) ? resolved.to[0] : resolved.to) || toIsoDate(0);
  const search = (Array.isArray(resolved.search) ? resolved.search[0] : resolved.search) || "";
  const page = parsePage(String(toNumber(resolved.page)));

  const data = await fetchAuditLogs(accessToken, {
    page,
    action: action || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    search: search || undefined,
  });

  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const hasActiveFilters = Boolean(search || action || fromDate !== toIsoDate(-7) || toDate !== toIsoDate(0));

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Audit Logs</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Filter booking actions and validate blockchain-linked references for defense.
        </p>
      </header>

      <form
        method="get"
        className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <SlidersHorizontal className="h-4 w-4 text-[var(--color-secondary)]" aria-hidden="true" />
            Filter Controls
          </div>
          {hasActiveFilters ? (
            <Link
              href={buildQuery({ page: 1 })}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Link>
          ) : null}
        </div>

        <input type="hidden" name="page" value="1" />
        <div className="grid gap-3 md:grid-cols-12">
          <label className="grid gap-1 text-xs text-[var(--color-muted)] md:col-span-4">
            Booking code / hash
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden="true" />
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="reservation code or hash"
                className="h-10 w-full rounded-lg border border-[var(--color-border)] pl-9 pr-3 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
              />
            </span>
          </label>
          <label className="grid gap-1 text-xs text-[var(--color-muted)] md:col-span-3">
            Action type
            <select
              name="action"
              defaultValue={action}
              className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            >
              <option value="">All actions</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="cancel">cancel</option>
              <option value="checkin">checkin</option>
              <option value="checkout">checkout</option>
              <option value="verify">verify</option>
              <option value="reject">reject</option>
              <option value="override_checkin">override_checkin</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-[var(--color-muted)] md:col-span-2">
            From
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            />
          </label>
          <label className="grid gap-1 text-xs text-[var(--color-muted)] md:col-span-2">
            To
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            />
          </label>
          <div className="flex items-end md:col-span-1">
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-[var(--color-primary)] px-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Apply
            </button>
          </div>
        </div>
      </form>

      {!data ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load audit logs. Verify API and admin session, then refresh.
        </p>
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)] shadow-sm">
          No audit logs found for current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Booking Hash</th>
                  <th className="px-4 py-3 font-semibold">Chain Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.audit_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">{formatDateTime(log.timestamp)}</td>
                    <td className="px-4 py-3">{log.performed_by?.name || log.performed_by?.email || log.performed_by_user_id || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge label={log.action} variant={statusToBadgeVariant(log.action)} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)] break-all">{log.data_hash || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs break-all">
                      {log.blockchain_tx_hash ? (
                        <a
                          href={toExplorerUrl(log.blockchain_tx_hash) || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--color-secondary)] underline"
                        >
                          {log.blockchain_tx_hash}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-[var(--color-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-xs text-[var(--color-muted)]">
              Page {page} of {totalPages} | {totalCount} total
            </p>
            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  href={buildQuery({
                    action: action || undefined,
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    search: search || undefined,
                    page: page - 1,
                  })}
                  prefetch
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
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    search: search || undefined,
                    page: page + 1,
                  })}
                  prefetch
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
