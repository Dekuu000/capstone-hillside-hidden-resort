import Link from "next/link";
import {
  escrowReconciliationResponseSchema,
} from "../../../../packages/shared/src/schemas";
import type { EscrowReconciliationResponse } from "../../../../packages/shared/src/types";
import { getServerAccessToken } from "../../../lib/serverAuth";
import { fetchServerApiData } from "../../../lib/serverApi";
import { AdminEscrowTableClient } from "../../../components/admin-escrow/AdminEscrowTableClient";

const PAGE_SIZE = 10;

function parsePage(raw: string | undefined): number {
  const parsed = Number(raw || "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function buildPageQuery(page: number) {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  return `?${qs.toString()}`;
}

async function fetchEscrowReconciliation(
  accessToken: string,
  page: number,
): Promise<EscrowReconciliationResponse | null> {
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);
  return fetchServerApiData({
    accessToken,
    path: `/v2/escrow/reconciliation?limit=${PAGE_SIZE}&offset=${offset}`,
    schema: escrowReconciliationResponseSchema,
    revalidate: 15,
  });
}

export default async function AdminEscrowPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Escrow Reconciliation</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const resolved = (await searchParams) ?? {};
  const page = parsePage(Array.isArray(resolved.page) ? resolved.page[0] : resolved.page);
  const data = await fetchEscrowReconciliation(accessToken, page);
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Escrow Reconciliation</h1>
        <p className="mt-1 text-sm text-slate-600">
          Compare reservation escrow metadata in Supabase vs on-chain escrow state.
        </p>
      </header>

      {!data ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load reconciliation data. Verify API is running and admin session is valid.
        </p>
      ) : (
        <>
          {data.cached === false || data.in_progress ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Reconciliation cache is warming up. Results may be partial while the background run is in progress.
            </p>
          ) : data.last_reconciled_at ? (
            <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Last reconciled at: {new Date(data.last_reconciled_at).toLocaleString()}
            </p>
          ) : null}

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="Total" value={String(data.summary.total)} tone="slate" />
            <MetricCard label="Match" value={String(data.summary.match)} tone="emerald" />
            <MetricCard label="Mismatch" value={String(data.summary.mismatch)} tone="amber" />
            <MetricCard label="Missing On-chain" value={String(data.summary.missing_onchain)} tone="rose" />
            <MetricCard label="Skipped" value={String(data.summary.skipped)} tone="slate" />
            <MetricCard
              label="Alert"
              value={data.summary.alert ? "ON" : "OFF"}
              tone={data.summary.alert ? "rose" : "emerald"}
            />
          </div>

          {data.items.length === 0 ? (
            <div className="rounded-xl border border-blue-100 bg-white p-6 text-sm text-slate-600 shadow-sm">
              No reservations found for reconciliation.
            </div>
          ) : (
            <div className="space-y-4">
              <AdminEscrowTableClient items={data.items} lastReconciledAt={data.last_reconciled_at} />
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Page {page} of {totalPages} | {totalCount} total
                </p>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link
                      href={buildPageQuery(page - 1)}
                      prefetch={false}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
                      Previous
                    </span>
                  )}
                  {page < totalPages ? (
                    <Link
                      href={buildPageQuery(page + 1)}
                      prefetch={false}
                      className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
                      Next
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "emerald" | "amber" | "rose";
}) {
  const toneMap = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  } as const;
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneMap[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

