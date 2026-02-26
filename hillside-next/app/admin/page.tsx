import Link from "next/link";
import { cookies } from "next/headers";
import {
  aiPricingMetricsResponseSchema,
  dashboardSummaryResponseSchema,
} from "../../../packages/shared/src/schemas";

type DashboardMetrics = {
  activeUnits: number;
  forVerification: number;
  pendingPayments: number;
  confirmed: number;
  reportWindowLabel: string;
  bookings: number;
  cancellations: number;
  cashCollected: number;
  occupancyRate: number;
};

type AiPricingMetrics = {
  generatedAt: string;
  totalRequests: number;
  remoteSuccess: number;
  fallbackCount: number;
  fallbackRate: number;
  lastFallbackReason: string | null;
  lastFallbackAt: string | null;
  p95LatencyMs: number;
};

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

async function fetchMetrics(accessToken: string): Promise<DashboardMetrics> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return {
      activeUnits: 0,
      forVerification: 0,
      pendingPayments: 0,
      confirmed: 0,
      reportWindowLabel: "Report window unavailable",
      bookings: 0,
      cancellations: 0,
      cashCollected: 0,
      occupancyRate: 0,
    };
  }

  const response = await fetch(`${base}/v2/dashboard/summary`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const json = response.ok ? await response.json() : null;
  const parsed = dashboardSummaryResponseSchema.safeParse(json);
  const summary = parsed.success ? parsed.data : null;
  return {
    activeUnits: summary?.metrics.active_units ?? 0,
    forVerification: summary?.metrics.for_verification ?? 0,
    pendingPayments: summary?.metrics.pending_payments ?? 0,
    confirmed: summary?.metrics.confirmed ?? 0,
    reportWindowLabel: summary ? `${summary.from_date} to ${summary.to_date}` : "Report window unavailable",
    bookings: summary?.summary.bookings ?? 0,
    cancellations: summary?.summary.cancellations ?? 0,
    cashCollected: summary?.summary.cash_collected ?? 0,
    occupancyRate: summary?.summary.occupancy_rate ?? 0,
  };
}

async function fetchAiMetrics(accessToken: string): Promise<AiPricingMetrics | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  const response = await fetch(`${base}/v2/ai/pricing/metrics`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const json = response.ok ? await response.json() : null;
  const parsed = aiPricingMetricsResponseSchema.safeParse(json);
  if (!parsed.success) return null;

  return {
    generatedAt: parsed.data.generated_at,
    totalRequests: parsed.data.total_requests,
    remoteSuccess: parsed.data.remote_success,
    fallbackCount: parsed.data.fallback_count,
    fallbackRate: parsed.data.fallback_rate,
    lastFallbackReason: parsed.data.last_fallback_reason ?? null,
    lastFallbackAt: parsed.data.last_fallback_at ?? null,
    p95LatencyMs: parsed.data.latency_ms.p95_ms,
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
}

export default async function AdminShellPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hs_at")?.value;
  const [metrics, aiMetrics] = token
    ? await Promise.all([fetchMetrics(token), fetchAiMetrics(token)])
    : [null, null];

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Admin widgets now read live values from the V2 API facade.
        </p>
      </header>

      {!metrics ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Unable to load dashboard metrics. Re-authenticate and refresh.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active Units" value={String(metrics.activeUnits)} hint="Currently bookable inventory" />
            <StatCard label="For Verification" value={String(metrics.forVerification)} hint="Reservations awaiting payment review" />
            <StatCard label="Pending Payments" value={String(metrics.pendingPayments)} hint="Items in admin payment inbox" />
            <StatCard label="Confirmed" value={String(metrics.confirmed)} hint="Confirmed reservations in the system" />
          </div>

          <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue Snapshot</p>
            <p className="mt-1 text-xs text-slate-500">{metrics.reportWindowLabel}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cash Collected</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatPeso(metrics.cashCollected)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Bookings</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{metrics.bookings}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cancellations</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{metrics.cancellations}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Avg Occupancy</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round((metrics.occupancyRate || 0) * 100)}%</p>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Pricing Monitor</p>
            {!aiMetrics ? (
              <p className="mt-2 text-sm text-slate-600">
                AI metrics unavailable. Verify API session and <code>/v2/ai/pricing/metrics</code>.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Updated {new Date(aiMetrics.generatedAt).toLocaleString()}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Total Requests</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{aiMetrics.totalRequests}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Remote Success</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{aiMetrics.remoteSuccess}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Fallback Rate</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {Math.round((aiMetrics.fallbackRate || 0) * 100)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Latency p95</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round(aiMetrics.p95LatencyMs)} ms</p>
                  </div>
                </div>
                {aiMetrics.lastFallbackReason ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Last fallback: {aiMetrics.lastFallbackReason}
                    {aiMetrics.lastFallbackAt ? ` (${new Date(aiMetrics.lastFallbackAt).toLocaleString()})` : ""}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/units" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Units</p>
          <p className="mt-1 text-sm text-slate-600">Manage unit availability and inventory status through <code>/v2/units</code>.</p>
        </Link>
        <Link href="/admin/reservations" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Reservations</p>
          <p className="mt-1 text-sm text-slate-600">List, filter, paginate, and inspect reservation details via <code>/v2/reservations</code>.</p>
        </Link>
        <Link href="/admin/walk-in-tour" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Walk-in Tour</p>
          <p className="mt-1 text-sm text-slate-600">Create on-site tour reservations through <code>POST /v2/reservations/tours</code>.</p>
        </Link>
        <Link href="/admin/payments" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Payments</p>
          <p className="mt-1 text-sm text-slate-600">Review pending payment submissions and process verify/reject actions via <code>/v2/payments</code>.</p>
        </Link>
        <Link href="/admin/check-in" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Check-in</p>
          <p className="mt-1 text-sm text-slate-600">Validate reservation codes and run check-in/check-out actions via <code>/v2/qr</code> and <code>/v2/operations</code>.</p>
        </Link>
        <Link href="/admin/reports" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Reports</p>
          <p className="mt-1 text-sm text-slate-600">View daily/monthly summary metrics through <code>/v2/reports/overview</code>.</p>
        </Link>
        <Link href="/admin/audit" className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-lg font-semibold text-slate-900">Audit Logs</p>
          <p className="mt-1 text-sm text-slate-600">Filter audit trails through <code>/v2/audit/logs</code> for compliance review.</p>
        </Link>
      </div>
    </section>
  );
}
