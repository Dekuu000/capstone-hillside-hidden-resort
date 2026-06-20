import { Coins } from "lucide-react";
import type { ReportsOverviewResponse, Role } from "../../../../packages/shared/src/types";
import { ROLE_LABELS } from "../../../../packages/shared/src/types";
import { reportsOverviewResponseSchema } from "../../../../packages/shared/src/schemas";
import { ReportDocument } from "../../../components/admin-reports/ReportDocument";
import { ReportsDateRangeForm } from "../../../components/admin-reports/ReportsDateRangeForm";
import { todayPlusLocalIsoDate } from "../../../lib/dateIso";
import { formatDateOnly, formatDateTime } from "../../../lib/dateDisplay";
import { formatPhpPeso as formatPeso } from "../../../lib/formatCurrency";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { fetchServerApiData } from "../../../lib/serverApi";

function formatPercent(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDisplayDate(value: string) {
  return formatDateOnly(value, {
    locale: "en-US",
    fallback: value,
    formatOptions: { month: "short", day: "numeric", year: "numeric" },
  });
}

function formatDisplayMonth(value: string) {
  return formatDateOnly(value, {
    locale: "en-US",
    fallback: value,
    formatOptions: { month: "long", year: "numeric" },
  });
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
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="mb-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Reports</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Daily, monthly, and summary analytics via V2 API.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const resolved = (await searchParams) ?? {};
  const fromDate = (Array.isArray(resolved.from) ? resolved.from[0] : resolved.from) || todayPlusLocalIsoDate(-7);
  const toDate = (Array.isArray(resolved.to) ? resolved.to[0] : resolved.to) || todayPlusLocalIsoDate(0);
  const [overview, auth] = await Promise.all([
    fetchOverview(accessToken, fromDate, toDate),
    getServerAuthContext(accessToken),
  ]);
  const preparedBy = auth
    ? `${ROLE_LABELS[(auth.role || "") as Role] || "Back office"}${auth.email ? ` (${auth.email})` : ""}`
    : "Back office";
  const generatedAt = new Date().toISOString();
  const netBookings = overview
    ? Math.max(overview.summary.bookings - overview.summary.cancellations, 0)
    : 0;
  const cancellationRate = overview
    ? overview.summary.bookings > 0
      ? overview.summary.cancellations / overview.summary.bookings
      : 0
    : 0;

  return (
    <section className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-secondary)]">Analytics</p>
            <h1 className="mt-2 text-[1.7rem] font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-[2rem]">Reports</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Daily, monthly, and summary analytics via V2 API.</p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 px-4 py-3 text-xs text-[var(--color-muted)]">
            <p className="font-semibold text-[var(--color-text)]">Range</p>
            <p className="mt-1">
              {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Last updated: {formatDateTime(new Date().toISOString(), { formatOptions: { hour: "numeric", minute: "2-digit" } })}
            </p>
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
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] xl:col-span-2">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Coins className="h-4 w-4" />
                </span>
                Cash Collected
              </p>
              <p className="mt-3 text-3xl font-bold tracking-[-0.01em] text-[var(--color-text)]">{formatPeso(overview.summary.cash_collected)}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">Primary KPI for the selected period</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <p className="text-xs text-[var(--color-muted)]">Bookings</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{overview.summary.bookings}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <p className="text-xs text-[var(--color-muted)]">Occupancy Rate</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{formatPercent(overview.summary.occupancy_rate)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <p className="text-xs text-[var(--color-muted)]">Net Bookings</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{netBookings}</p>
            </div>
            <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 shadow-sm">
              <p className="text-xs text-rose-700">Cancellations</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{overview.summary.cancellations}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <p className="text-xs text-[var(--color-muted)]">Unit Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{formatPeso(overview.summary.unit_booked_value)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <p className="text-xs text-[var(--color-muted)]">Tour Booked Value</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{formatPeso(overview.summary.tour_booked_value)}</p>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-sm">
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
              Net bookings: {netBookings}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
              Cancellation rate: {Math.round(cancellationRate * 100)}%
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
              Range: {formatDisplayDate(fromDate)} - {formatDisplayDate(toDate)}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
              <header className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Daily</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Performance breakdown by day</p>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--color-background)] text-[var(--color-muted)]">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-center">Bookings</th>
                      <th className="px-4 py-2 text-right">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.daily.map((row) => (
                      <tr key={row.report_date} className="border-t border-[var(--color-border)] hover:bg-[var(--color-background)]">
                        <td className="px-4 py-2">{formatDisplayDate(row.report_date)}</td>
                        <td className="px-4 py-2 text-center">{row.bookings}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatPeso(row.cash_collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
              <header className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Monthly</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Aggregated summary by month</p>
              </header>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--color-background)] text-[var(--color-muted)]">
                    <tr>
                      <th className="px-4 py-2 text-left">Month</th>
                      <th className="px-4 py-2 text-center">Bookings</th>
                      <th className="px-4 py-2 text-right">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.monthly.map((row) => (
                      <tr key={row.report_month} className="border-t border-[var(--color-border)] hover:bg-[var(--color-background)]">
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

      {overview ? (
        <ReportDocument overview={overview} preparedBy={preparedBy} generatedAt={generatedAt} />
      ) : null}
    </section>
  );
}

