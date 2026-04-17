"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  RefreshCcw,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { z } from "zod";
import { aiPricingMetricsResponseSchema, pricingRecommendationSchema } from "../../../packages/shared/src/schemas";
import type { AiPricingMetricsResponse, PricingRecommendation } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { AIPricingInsightCard } from "../ai/AIPricingInsightCard";
import { PageHeader } from "../layout/PageHeader";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "../shared/Skeleton";
import { StatCard } from "../shared/StatCard";
import { Tabs } from "../shared/Tabs";
import { useToast } from "../shared/ToastProvider";

type AdminAiCenterClientProps = {
  token: string;
};

const occupancyItemSchema = z.object({
  date: z.string().min(1),
  occupancy: z.number(),
});

const occupancyForecastResponseSchema = z.object({
  forecast_id: z.number().int().optional().nullable(),
  generated_at: z.string(),
  start_date: z.string(),
  horizon_days: z.number().int(),
  model_version: z.string(),
  source: z.string(),
  items: z.array(occupancyItemSchema),
  notes: z.array(z.string()).default([]),
});

type OccupancyForecastResponse = z.infer<typeof occupancyForecastResponseSchema>;

const conciergeSuggestionSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  reasons: z.array(z.string()).default([]),
});

const conciergeResponseSchema = z.object({
  segment_key: z.string(),
  stay_type: z.string().optional().nullable(),
  model_version: z.string().optional().nullable(),
  suggestions: z.array(conciergeSuggestionSchema),
  notes: z.array(z.string()).default([]),
});

type ConciergeResponse = z.infer<typeof conciergeResponseSchema>;

const pricingApplyResponseSchema = z.object({
  ok: z.boolean(),
  logged: z.boolean(),
  reservation_id: z.string().optional().nullable(),
  applied_at: z.string(),
});

const tabItems = [
  { id: "pricing", label: "Pricing", icon: <TrendingUp className="h-4 w-4" /> },
  { id: "forecast", label: "Forecast", icon: <Activity className="h-4 w-4" /> },
  { id: "concierge", label: "Concierge", icon: <Users className="h-4 w-4" /> },
];

const FALLBACK_WARN_THRESHOLD = 0.25;
const FALLBACK_CRIT_THRESHOLD = 0.5;
const LATENCY_WARN_MS = 1800;
const LATENCY_CRIT_MS = 3000;

type ChecklistItem = {
  label: string;
  done: boolean;
  warn?: boolean;
};

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function buildPolylinePoints(data: Array<{ occupancy: number }>) {
  if (!data.length) return "";
  const width = 640;
  const height = 180;
  const maxValue = Math.max(...data.map((item) => item.occupancy), 1);
  return data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - (item.occupancy / maxValue) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildOpsGuidance(items: Array<{ date: string; occupancy: number }>) {
  if (!items.length) return null;
  const toRatio = (value: number) => {
    if (value > 1.5) return Math.max(0, Math.min(1, value / 100));
    return Math.max(0, Math.min(1, value));
  };
  const values = items.map((item) => toRatio(item.occupancy));
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const peak = Math.max(...values);
  const peakIndex = values.findIndex((value) => value === peak);
  const peakRow = items[peakIndex] ?? items[0];

  const staffingTier = avg >= 0.82 ? "high coverage" : avg >= 0.58 ? "balanced coverage" : "lean coverage";
  const inventoryTier = peak >= 0.88 ? "front-load inventory buffers" : peak >= 0.62 ? "normal inventory prep" : "light inventory prep";

  return {
    avg,
    peak,
    peakDate: peakRow.date,
    staffingTier,
    inventoryTier,
    actions: [
      `Staffing mode: ${staffingTier} based on ${Math.round(avg * 100)}% average forecast occupancy.`,
      `Peak watch: ${Math.round(peak * 100)}% on ${peakRow.date}.`,
      `Inventory plan: ${inventoryTier} around peak window.`,
    ],
  };
}

function ChecklistCard({
  title,
  items,
}: {
  title: string;
  items: ChecklistItem[];
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{title}</p>
      <ul className="mt-2 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-[var(--color-text)]">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : item.warn ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CircleDashed className="h-4 w-4 text-[var(--color-muted)]" />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminAiCenterClient({ token }: AdminAiCenterClientProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState("pricing");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<AiPricingMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [recommendation, setRecommendation] = useState<PricingRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [pricingActionMessage, setPricingActionMessage] = useState<string | null>(null);
  const [pricingAppliedAt, setPricingAppliedAt] = useState<string | null>(null);

  const [forecast, setForecast] = useState<OccupancyForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [segmentKey, setSegmentKey] = useState("family_weekend");
  const [stayType, setStayType] = useState("stay");
  const [concierge, setConcierge] = useState<ConciergeResponse | null>(null);
  const [conciergeLoading, setConciergeLoading] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const [conciergeNoteMessage, setConciergeNoteMessage] = useState<string | null>(null);

  const forecastPoints = useMemo(() => buildPolylinePoints(forecast?.items ?? []), [forecast?.items]);
  const opsGuidance = useMemo(() => buildOpsGuidance(forecast?.items ?? []), [forecast?.items]);

  const pricingHealth = useMemo(() => {
    if (!metrics) {
      return { label: "Pricing health: unknown", variant: "neutral" as const };
    }
    const fallbackRate = metrics.fallback_rate ?? 0;
    const p95Latency = metrics.latency_ms.p95_ms ?? 0;
    if (fallbackRate >= FALLBACK_CRIT_THRESHOLD || p95Latency >= LATENCY_CRIT_MS) {
      return { label: "Pricing health: degraded", variant: "error" as const };
    }
    if (fallbackRate >= FALLBACK_WARN_THRESHOLD || p95Latency >= LATENCY_WARN_MS) {
      return { label: "Pricing health: watch", variant: "warn" as const };
    }
    return { label: "Pricing health: stable", variant: "success" as const };
  }, [metrics]);

  const forecastHealth = useMemo(() => {
    if (!forecast) {
      return { label: "Forecast model: pending", variant: "neutral" as const };
    }
    if (forecast.model_version.toLowerCase().includes("prophet")) {
      return { label: "Forecast model: prophet", variant: "success" as const };
    }
    return { label: `Forecast model: ${forecast.model_version}`, variant: "warn" as const };
  }, [forecast]);

  const conciergeHealth = useMemo(() => {
    if (!concierge?.model_version) {
      return { label: "Concierge model: pending", variant: "neutral" as const };
    }
    if (concierge.model_version.toLowerCase().includes("fallback")) {
      return { label: "Concierge model: fallback", variant: "warn" as const };
    }
    return { label: "Concierge model: live", variant: "success" as const };
  }, [concierge?.model_version]);

  const thresholdAlerts = useMemo(() => {
    if (!metrics) return [] as string[];
    const alerts: string[] = [];
    if ((metrics.fallback_rate ?? 0) >= FALLBACK_WARN_THRESHOLD) {
      alerts.push(`Fallback rate is ${toPercent(metrics.fallback_rate)} (target < ${toPercent(FALLBACK_WARN_THRESHOLD)}).`);
    }
    if ((metrics.latency_ms.p95_ms ?? 0) >= LATENCY_WARN_MS) {
      alerts.push(`P95 latency is ${Math.round(metrics.latency_ms.p95_ms)}ms (target < ${LATENCY_WARN_MS}ms).`);
    }
    return alerts;
  }, [metrics]);

  const pricingChecklist = useMemo<ChecklistItem[]>(() => {
    const fallbackRate = metrics?.fallback_rate ?? 0;
    const p95Latency = metrics?.latency_ms.p95_ms ?? 0;
    return [
      { label: "Load pricing telemetry metrics", done: Boolean(metrics) },
      { label: "Generate recommendation with reasons", done: Boolean(recommendation) },
      { label: "Apply/log recommendation to audit trail", done: Boolean(pricingAppliedAt) },
      {
        label: `Keep fallback < ${toPercent(FALLBACK_WARN_THRESHOLD)} and p95 < ${LATENCY_WARN_MS}ms`,
        done: Boolean(metrics) && fallbackRate < FALLBACK_WARN_THRESHOLD && p95Latency < LATENCY_WARN_MS,
        warn: Boolean(metrics) && (fallbackRate >= FALLBACK_WARN_THRESHOLD || p95Latency >= LATENCY_WARN_MS),
      },
    ];
  }, [metrics, recommendation, pricingAppliedAt]);

  const forecastChecklist = useMemo<ChecklistItem[]>(() => {
    const isProphet = Boolean(forecast?.model_version.toLowerCase().includes("prophet"));
    return [
      { label: "Generate 14-day occupancy forecast", done: Boolean(forecast) },
      { label: "Run with Prophet model path", done: isProphet, warn: Boolean(forecast) && !isProphet },
      { label: "Render trend chart and date table", done: Boolean(forecast && forecast.items.length > 0) },
      { label: "Show staffing/inventory guidance", done: Boolean(opsGuidance) },
    ];
  }, [forecast, opsGuidance]);

  const conciergeChecklist = useMemo<ChecklistItem[]>(() => {
    const isFallback = Boolean(concierge?.model_version?.toLowerCase().includes("fallback"));
    return [
      { label: "Select anonymized segment key", done: Boolean(segmentKey) },
      { label: "Generate concierge suggestions", done: Boolean(concierge) },
      { label: "Show why-suggested reasons per card", done: Boolean(concierge?.suggestions.length) },
      { label: "Use non-fallback concierge model", done: Boolean(concierge) && !isFallback, warn: Boolean(concierge) && isFallback },
    ];
  }, [segmentKey, concierge]);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await apiFetch<AiPricingMetricsResponse>(
        "/v2/ai/pricing/metrics",
        { method: "GET" },
        token,
        aiPricingMetricsResponseSchema,
      );
      setMetrics(data);
      setLastUpdated(new Date().toISOString());
    } catch (unknownError) {
      setMetricsError(unknownError instanceof Error ? unknownError.message : "Failed to load AI pricing metrics.");
    } finally {
      setMetricsLoading(false);
    }
  };

  const generatePricingRecommendation = async () => {
    setRecommendationLoading(true);
    setRecommendationError(null);
    setPricingActionMessage(null);
    setPricingAppliedAt(null);
    try {
      const nextDay = new Date();
      nextDay.setDate(nextDay.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 3);
      const checkIn = nextDay.toISOString().slice(0, 10);
      const checkOut = dayAfter.toISOString().slice(0, 10);

      const data = await apiFetch<PricingRecommendation>(
        "/v2/ai/pricing/recommendation",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: "preview",
            check_in_date: checkIn,
            check_out_date: checkOut,
            total_amount: 4200,
            party_size: 3,
            unit_count: 1,
            is_tour: false,
            occupancy_context: {},
          }),
        },
        token,
        pricingRecommendationSchema,
      );
      setRecommendation(data);
      setLastUpdated(new Date().toISOString());
    } catch (unknownError) {
      setRecommendationError(unknownError instanceof Error ? unknownError.message : "Failed to generate recommendation.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const applyPricingRecommendation = async () => {
    if (!recommendation) return;
    setPricingActionMessage(null);
    try {
      const response = await apiFetch(
        "/v2/ai/pricing/apply",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: recommendation.reservation_id || null,
            pricing_adjustment: recommendation.pricing_adjustment,
            confidence: recommendation.confidence,
            explanations: recommendation.explanations,
            notes: "Applied from AI Center.",
          }),
        },
        token,
        pricingApplyResponseSchema,
      );
      setPricingActionMessage(`Recommendation logged at ${new Date(response.applied_at).toLocaleString()}.`);
      setPricingAppliedAt(response.applied_at);
      showToast({
        type: "success",
        title: "Recommendation applied",
        message: "Pricing action was logged successfully.",
      });
    } catch (unknownError) {
      setPricingActionMessage(
        unknownError instanceof Error ? `Apply failed: ${unknownError.message}` : "Apply failed.",
      );
    }
  };

  const generateForecast = async () => {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const data = await apiFetch<OccupancyForecastResponse>(
        "/v2/ai/occupancy/forecast",
        {
          method: "POST",
          body: JSON.stringify({
            horizon_days: 14,
            history_days: 45,
          }),
        },
        token,
        occupancyForecastResponseSchema,
      );
      setForecast(data);
      setLastUpdated(new Date().toISOString());
    } catch (unknownError) {
      setForecastError(unknownError instanceof Error ? unknownError.message : "Failed to generate forecast.");
    } finally {
      setForecastLoading(false);
    }
  };

  const loadConcierge = async () => {
    setConciergeLoading(true);
    setConciergeError(null);
    setConciergeNoteMessage(null);
    try {
      const data = await apiFetch<ConciergeResponse>(
        "/v2/ai/concierge/recommendation",
        {
          method: "POST",
          body: JSON.stringify({
            segment_key: segmentKey,
            stay_type: stayType || null,
          }),
        },
        token,
        conciergeResponseSchema,
      );
      setConcierge(data);
      setLastUpdated(new Date().toISOString());
    } catch (unknownError) {
      setConciergeError(unknownError instanceof Error ? unknownError.message : "Failed to load concierge recommendations.");
    } finally {
      setConciergeLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="AI Hospitality Intelligence"
        subtitle="Defense-ready center for pricing, occupancy forecasting, and anonymized concierge recommendations."
        rightSlot={
          <Button
            variant="secondary"
            leftSlot={<RefreshCcw className="h-4 w-4" />}
            onClick={() => {
              if (tab === "pricing") void loadMetrics();
              if (tab === "forecast") void generateForecast();
              if (tab === "concierge") void loadConcierge();
            }}
          >
            Refresh
          </Button>
        }
        statusSlot={
          <>
            <Badge
              label={lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}` : "No updates yet"}
              variant="neutral"
            />
            <Badge label={pricingHealth.label} variant={pricingHealth.variant} />
            <Badge label={forecastHealth.label} variant={forecastHealth.variant} />
            <Badge label={conciergeHealth.label} variant={conciergeHealth.variant} />
          </>
        }
      />

      <Tabs items={tabItems} value={tab} onChange={setTab} className="mb-5" />

      {tab === "pricing" ? (
        <div id="tab-panel-pricing" role="tabpanel" aria-labelledby="tab-pricing" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Requests"
              value={String(metrics?.total_requests ?? 0)}
              hint="Pricing engine calls"
              icon={<Activity className="h-4 w-4" />}
              tone="info"
            />
            <StatCard
              label="Remote Success"
              value={String(metrics?.remote_success ?? 0)}
              hint="Served by AI service"
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
            />
            <StatCard
              label="Fallback Rate"
              value={toPercent(metrics?.fallback_rate ?? 0)}
              hint="Fallback utilization"
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="warn"
            />
            <StatCard
              label="P95 Latency"
              value={`${Math.round(metrics?.latency_ms.p95_ms ?? 0)} ms`}
              hint="Inference response speed"
              icon={<Timer className="h-4 w-4" />}
            />
          </div>

          {metricsLoading ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </div>
          ) : null}
          {metricsError ? (
            <p className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{metricsError}</p>
          ) : null}

          {thresholdAlerts.length > 0 ? (
            <section className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                <span>Model risk alert</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {thresholdAlerts.map((alert) => (
                  <li key={alert}>{alert}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <AIPricingInsightCard
            title="Dynamic Pricing Recommendation"
            recommendation={recommendation}
            loading={recommendationLoading}
            error={recommendationError}
            showViewLink={false}
            metrics={
              metrics
                ? {
                    generatedAt: metrics.generated_at,
                    totalRequests: metrics.total_requests,
                    fallbackRate: metrics.fallback_rate,
                    p95LatencyMs: metrics.latency_ms.p95_ms,
                  }
                : undefined
            }
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  leftSlot={<RefreshCcw className="h-4 w-4" />}
                  onClick={() => void loadMetrics()}
                  loading={metricsLoading}
                >
                  Refresh metrics
                </Button>
                <Button
                  leftSlot={<Sparkles className="h-4 w-4" />}
                  onClick={() => void generatePricingRecommendation()}
                  loading={recommendationLoading}
                >
                  Generate recommendation
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void applyPricingRecommendation()}
                  disabled={!recommendation}
                >
                  Apply recommendation
                </Button>
              </div>
            }
          />
          {pricingActionMessage ? (
            <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3 text-sm text-[var(--color-text)]">
              {pricingActionMessage}
            </p>
          ) : null}

          <ChecklistCard title="Pricing Acceptance Checklist" items={pricingChecklist} />
        </div>
      ) : null}

      {tab === "forecast" ? (
        <div id="tab-panel-forecast" role="tabpanel" aria-labelledby="tab-forecast" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              leftSlot={<CalendarDays className="h-4 w-4" />}
              onClick={() => void generateForecast()}
              loading={forecastLoading}
            >
              Generate new forecast (14 days)
            </Button>
          </div>

          {forecastLoading ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="mt-3 h-40 w-full" />
            </div>
          ) : null}

          {forecastError ? (
            <p className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{forecastError}</p>
          ) : null}

          {!forecastLoading && !forecastError && !forecast ? (
            <EmptyState
              title="No forecast run yet"
              description="Generate a 14-day occupancy forecast to show staffing and inventory planning intelligence."
              actionLabel="Generate forecast"
              onAction={() => void generateForecast()}
            />
          ) : null}

          {forecast ? (
            <>
              {!forecast.model_version.toLowerCase().includes("prophet") ? (
                <section className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Forecast is running on fallback path</span>
                  </div>
                  <p className="mt-2">
                    Current model: <strong>{forecast.model_version}</strong>. For defense mode, run Prophet path and regenerate.
                  </p>
                </section>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Model Version" value={forecast.model_version} hint="Current forecast model" tone="info" />
                <StatCard label="Source" value={forecast.source} hint="Inference service" />
                <StatCard label="Forecast Horizon" value={`${forecast.horizon_days} days`} hint="Projected window" tone="success" />
              </div>

              <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Occupancy trend (next {forecast.horizon_days} days)</p>
                  <Badge
                    label={
                      forecast.model_version.includes("prophet")
                        ? "Prophet"
                        : forecast.model_version.includes("sklearn")
                          ? "sklearn fallback"
                          : "heuristic fallback"
                    }
                    variant={forecast.model_version.includes("prophet") ? "success" : "warn"}
                  />
                  <Badge label={forecast.model_version} variant="neutral" />
                  {forecast.notes.some((note) => note.toLowerCase().includes("cached")) ? (
                    <Badge label="served from cache" variant="info" />
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Last forecast run: {new Date(forecast.generated_at).toLocaleString()}
                </p>
                <div className="mt-3 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3">
                  <svg viewBox="0 0 640 180" className="h-48 w-full min-w-[500px]" role="img" aria-label="Occupancy forecast line chart">
                    <polyline
                      fill="none"
                      stroke="var(--color-secondary)"
                      strokeWidth="3"
                      points={forecastPoints}
                    />
                  </svg>
                </div>
              </section>

              {opsGuidance ? (
                <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">Staffing & inventory guidance</p>
                    <Badge label="Derived from forecast" variant="info" />
                    <Badge label="ops-policy-v1" variant="neutral" />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <StatCard
                      label="Average Occupancy"
                      value={`${Math.round(opsGuidance.avg * 100)}%`}
                      hint="Forecast period mean"
                      tone="info"
                    />
                    <StatCard
                      label="Peak Occupancy"
                      value={`${Math.round(opsGuidance.peak * 100)}%`}
                      hint={opsGuidance.peakDate}
                      tone="warn"
                    />
                    <StatCard
                      label="Recommended Staffing"
                      value={opsGuidance.staffingTier}
                      hint="Operational tier"
                      tone="success"
                    />
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-text)]">
                    {opsGuidance.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Forecast Occupancy</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.items.map((row) => (
                        <tr key={row.date} className="border-t border-[var(--color-border)]">
                          <td className="px-3 py-2 text-[var(--color-text)]">{row.date}</td>
                          <td className="px-3 py-2 text-[var(--color-text)]">{row.occupancy.toFixed(2)}</td>
                          <td className="px-3 py-2 text-[var(--color-muted)]">{forecast.notes[0] || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <ChecklistCard title="Forecast Acceptance Checklist" items={forecastChecklist} />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "concierge" ? (
        <div id="tab-panel-concierge" role="tabpanel" aria-labelledby="tab-concierge" className="space-y-4">
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Segment key
                <select
                  value={segmentKey}
                  onChange={(event) => setSegmentKey(event.target.value)}
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3"
                >
                  <option value="family_weekend">family_weekend</option>
                  <option value="couple_escape">couple_escape</option>
                  <option value="barkada_daytrip">barkada_daytrip</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Stay type
                <select
                  value={stayType}
                  onChange={(event) => setStayType(event.target.value)}
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3"
                >
                  <option value="stay">stay</option>
                  <option value="day_tour">day_tour</option>
                  <option value="advance_booking">advance_booking</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  leftSlot={<Sparkles className="h-4 w-4" />}
                  onClick={() => void loadConcierge()}
                  loading={conciergeLoading}
                >
                  Generate concierge suggestions
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Concierge suggestions use anonymized segment keys only. No personal guest identifiers are processed.
            </p>
          </section>

          {conciergeError ? (
            <p className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{conciergeError}</p>
          ) : null}
          {conciergeLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-36 rounded-[var(--radius-md)]" />
              <Skeleton className="h-36 rounded-[var(--radius-md)]" />
            </div>
          ) : null}

          {!conciergeLoading && !conciergeError && !concierge ? (
            <EmptyState
              title="No concierge suggestions yet"
              description="Generate recommendations for an anonymized guest segment to showcase personalized concierge intelligence."
              actionLabel="Generate suggestions"
              onAction={() => void loadConcierge()}
            />
          ) : null}

          {concierge ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={`Segment ${concierge.segment_key}`} variant="info" />
                {concierge.model_version ? <Badge label={concierge.model_version} variant="neutral" /> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {concierge.suggestions.map((item) => (
                  <article
                    key={item.code}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]"
                  >
                    <p className="text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{item.description}</p>
                    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                        Why suggested
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text)]">
                        {item.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={() => {
                        setConciergeNoteMessage(`Added "${item.title}" to guest note draft.`);
                        showToast({
                          type: "success",
                          title: "Suggestion added",
                          message: `"${item.title}" added to guest note draft.`,
                        });
                      }}
                    >
                      Add to guest note
                    </Button>
                  </article>
                ))}
              </div>
              {concierge.notes.length > 0 ? (
                <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Model notes</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text)]">
                    {concierge.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {conciergeNoteMessage ? (
            <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]">
              {conciergeNoteMessage}
            </p>
          ) : null}

          <ChecklistCard title="Concierge Acceptance Checklist" items={conciergeChecklist} />
        </div>
      ) : null}
    </section>
  );
}
