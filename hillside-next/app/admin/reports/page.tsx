import type { ReportsOverviewResponse } from "../../../../packages/shared/src/types";
import { reportsOverviewResponseSchema } from "../../../../packages/shared/src/schemas";
import { ReportsDateRangeForm } from "../../../components/admin-reports/ReportsDateRangeForm";
import { getServerAccessToken } from "../../../lib/serverAuth";
import { fetchServerApiData } from "../../../lib/serverApi";

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

function formatDisplayDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDisplayMonth(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function fetchOverview(
  accessToken: string,
  fromDate: string,
  toDate: string,
): Promise<ReportsOverviewResponse | null> {
  const qs = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
  });
  return fetchServerApiData({
    accessToken,
    path: `/v2/reports/overview?${qs.toString()}`,
    schema: reportsOverviewResponseSchema,
    revalidate: 20,
  });
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
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
          <p className="mt-2 text-sm text-slate-600">Daily, monthly, and summary analytics via V2 API.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
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
      <header className="mb-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Analytics</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Reports</h1>
            <p className="mt-2 text-sm text-slate-600">Daily, monthly, and summary analytics via V2 API.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Range</p>
            <p className="mt-1">
              {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Last updated: {new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      </header>

      <ReportsDateRangeForm
        fromDate={fromDate}
        toDate={toDate}
        daily={overview?.daily ?? []}
        monthly={overview?.monthly ?? []}
      />

      {!overview ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load report overview. Verify API and admin session, then refresh.
        </p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Bookings</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{overview.summary.bookings}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cancellations</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{overview.summary.cancellations}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cash Collected</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(overview.summary.cash_collected)}</p>
              <p className="mt-1 text-[11px] font-medium text-emerald-700">Primary KPI for the selected period</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Occupancy Rate</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPercent(overview.summary.occupancy_rate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Unit Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(overview.summary.unit_booked_value)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Tour Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(overview.summary.tour_booked_value)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Daily</h2>
                <p className="mt-1 text-xs text-slate-500">Performance breakdown by day</p>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-center">Bookings</th>
                      <th className="px-4 py-2 text-right">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.daily.map((row) => (
                      <tr key={row.report_date} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-2">{formatDisplayDate(row.report_date)}</td>
                        <td className="px-4 py-2 text-center">{row.bookings}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatPeso(row.cash_collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Monthly</h2>
                <p className="mt-1 text-xs text-slate-500">Aggregated summary by month</p>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Month</th>
                      <th className="px-4 py-2 text-center">Bookings</th>
                      <th className="px-4 py-2 text-right">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.monthly.map((row) => (
                      <tr key={row.report_month} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-2">{formatDisplayMonth(row.report_month)}</td>
                        <td className="px-4 py-2 text-center">{row.bookings}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatPeso(row.cash_collected)}</td>
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
