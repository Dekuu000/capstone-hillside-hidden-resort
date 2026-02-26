import type { ReportsOverviewResponse } from "../../../../packages/shared/src/types";
import { reportsOverviewResponseSchema } from "../../../../packages/shared/src/schemas";
import { getServerAccessToken } from "../../../lib/serverAuth";

function toLocalIsoDate(dayOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

async function fetchOverview(
  accessToken: string,
  fromDate: string,
  toDate: string,
): Promise<ReportsOverviewResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  const qs = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
  });
  const response = await fetch(`${base}/v2/reports/overview?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const json = await response.json();
  const parsed = reportsOverviewResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const resolved = (await searchParams) ?? {};
  const fromDate = (Array.isArray(resolved.from) ? resolved.from[0] : resolved.from) || toLocalIsoDate(-7);
  const toDate = (Array.isArray(resolved.to) ? resolved.to[0] : resolved.to) || toLocalIsoDate(0);
  const overview = await fetchOverview(accessToken, fromDate, toDate);

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Daily, monthly, and summary analytics via V2 API.</p>
      </header>

      <form method="get" className="mb-5 grid gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="grid gap-1 text-sm text-slate-700">
          From
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          To
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
          />
        </label>
        <div className="md:col-span-2 flex items-end">
          <button
            type="submit"
            className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Apply range
          </button>
        </div>
      </form>

      {!overview ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load report overview. Verify API and admin session, then refresh.
        </p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Bookings</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{overview.summary.bookings}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cancellations</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{overview.summary.cancellations}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cash Collected</p>
              <p className="mt-1 text-2xl font-bold text-blue-900">{formatPeso(overview.summary.cash_collected)}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Occupancy Rate</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPercent(overview.summary.occupancy_rate)}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Unit Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(overview.summary.unit_booked_value)}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Tour Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(overview.summary.tour_booked_value)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Daily</h2>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Bookings</th>
                      <th className="px-4 py-2 text-left">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.daily.map((row) => (
                      <tr key={row.report_date} className="border-t border-slate-100">
                        <td className="px-4 py-2">{row.report_date}</td>
                        <td className="px-4 py-2">{row.bookings}</td>
                        <td className="px-4 py-2">{formatPeso(row.cash_collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Monthly</h2>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Month</th>
                      <th className="px-4 py-2 text-left">Bookings</th>
                      <th className="px-4 py-2 text-left">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.monthly.map((row) => (
                      <tr key={row.report_month} className="border-t border-slate-100">
                        <td className="px-4 py-2">{row.report_month}</td>
                        <td className="px-4 py-2">{row.bookings}</td>
                        <td className="px-4 py-2">{formatPeso(row.cash_collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
