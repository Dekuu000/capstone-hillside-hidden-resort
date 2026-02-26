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
    <article className="group rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-900">Live</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
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
      <header className="mb-8 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Operations Console</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Hillside Admin Overview</h1>
            <p className="mt-2 text-sm text-slate-600">
              Live signals for bookings, payments, and revenue. Use quick actions below to jump into ops.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">System status</p>
            <p className="mt-1">API + AI services active</p>
          </div>
        </div>
      </header>

      {!metrics ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Unable to load dashboard metrics. Re-authenticate and refresh.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active Units" value={String(metrics.activeUnits)} hint="Currently bookable inventory" />
            <StatCard label="For Verification" value={String(metrics.forVerification)} hint="Reservations awaiting payment review" />
            <StatCard label="Pending Payments" value={String(metrics.pendingPayments)} hint="Items in admin payment inbox" />
            <StatCard label="Confirmed" value={String(metrics.confirmed)} hint="Confirmed reservations in the system" />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Revenue Snapshot</p>
                  <p className="mt-1 text-xs text-slate-500">{metrics.reportWindowLabel}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">PHP</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Cash Collected</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatPeso(metrics.cashCollected)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Bookings</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{metrics.bookings}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Cancellations</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{metrics.cancellations}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Avg Occupancy</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round((metrics.occupancyRate || 0) * 100)}%</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ops Focus</p>
              <p className="mt-2 text-sm text-slate-600">
                Prioritize payment verification and keep inventory healthy for weekend spikes.
              </p>
              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <p className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  Verification queue <span className="font-semibold text-slate-900">{metrics.forVerification}</span>
                </p>
                <p className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  Pending payments <span className="font-semibold text-slate-900">{metrics.pendingPayments}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">AI Pricing Monitor</p>
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Total Requests</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{aiMetrics.totalRequests}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Remote Success</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{aiMetrics.remoteSuccess}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Fallback Rate</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {Math.round((aiMetrics.fallbackRate || 0) * 100)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            href: "/admin/units",
            title: "Units",
            copy: "Manage unit availability and inventory status through /v2/units.",
          },
          {
            href: "/admin/reservations",
            title: "Reservations",
            copy: "List, filter, paginate, and inspect reservation details via /v2/reservations.",
          },
          {
            href: "/admin/walk-in-tour",
            title: "Walk-in Tour",
            copy: "Create on-site tour reservations through POST /v2/reservations/tours.",
          },
          {
            href: "/admin/payments",
            title: "Payments",
            copy: "Review pending payment submissions and process verify/reject actions via /v2/payments.",
          },
          {
            href: "/admin/check-in",
            title: "Check-in",
            copy: "Validate reservation codes and run check-in/check-out actions via /v2/qr and /v2/operations.",
          },
          {
            href: "/admin/reports",
            title: "Reports",
            copy: "View daily/monthly summary metrics through /v2/reports/overview.",
          },
          {
            href: "/admin/audit",
            title: "Audit Logs",
            copy: "Filter audit trails through /v2/audit/logs for compliance review.",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-900">{card.title}</p>
              <span className="text-xs font-semibold text-blue-700 opacity-0 transition group-hover:opacity-100">
                Open
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{card.copy}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
