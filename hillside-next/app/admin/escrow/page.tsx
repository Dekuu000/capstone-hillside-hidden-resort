import Link from "next/link";
import {
  escrowReconciliationResponseSchema,
} from "../../../../packages/shared/src/schemas";
import type { EscrowReconciliationResponse } from "../../../../packages/shared/src/types";
import { getServerAccessToken } from "../../../lib/serverAuth";

const PAGE_SIZE = 20;

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
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);
  const response = await fetch(
    `${base}/v2/escrow/reconciliation?limit=${PAGE_SIZE}&offset=${offset}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = escrowReconciliationResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
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
            <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Reservation</th>
                      <th className="px-4 py-3 font-semibold">DB State</th>
                      <th className="px-4 py-3 font-semibold">On-chain State</th>
                      <th className="px-4 py-3 font-semibold">Result</th>
                      <th className="px-4 py-3 font-semibold">Tx Hash</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.reservation_id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{item.reservation_code}</div>
                          <div className="text-xs text-slate-500 font-mono">{item.reservation_id}</div>
                        </td>
                        <td className="px-4 py-3">{item.db_escrow_state}</td>
                        <td className="px-4 py-3">{item.onchain_state || "-"}</td>
                        <td className="px-4 py-3">
                          <ResultBadge value={item.result} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-900 break-all">
                          {item.chain_tx_hash || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.reason || "-"}</td>
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
                  {page > 1 ? (
                    <Link
                      href={buildPageQuery(page - 1)}
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

function ResultBadge({ value }: { value: "match" | "mismatch" | "missing_onchain" | "skipped" }) {
  const classes =
    value === "match"
      ? "bg-emerald-100 text-emerald-700"
      : value === "mismatch"
        ? "bg-amber-100 text-amber-800"
        : value === "missing_onchain"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-200 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>{value}</span>;
}
