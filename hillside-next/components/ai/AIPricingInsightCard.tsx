"use client";

import Link from "next/link";
import { CircleAlert, Sparkles, Timer, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { PricingRecommendation } from "../../../packages/shared/src/types";
import { Badge } from "../shared/Badge";
import { Skeleton } from "../shared/Skeleton";

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getSource(recommendation: PricingRecommendation | null) {
  if (!recommendation) return "live";
  const lowered = recommendation.explanations.map((item) => item.toLowerCase());
  return lowered.some((item) => item.includes("fallback")) ? "fallback" : "live";
}

function extractModelVersion(recommendation: PricingRecommendation | null): string | null {
  if (!recommendation) return null;
  for (const item of recommendation.explanations) {
    const match = item.match(/model used \(([^)]+)\)/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function AIPricingInsightCard({
  recommendation,
  loading = false,
  error = null,
  metrics,
  title = "AI Pricing Insight",
  showViewLink = true,
  actions,
}: {
  recommendation?: PricingRecommendation | null;
  loading?: boolean;
  error?: string | null;
  metrics?: {
    generatedAt?: string | null;
    totalRequests?: number;
    fallbackRate?: number;
    p95LatencyMs?: number;
  };
  title?: string;
  showViewLink?: boolean;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <TrendingUp className="h-4 w-4 text-[var(--color-secondary)]" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {recommendation ? (
            <Badge
              label={getSource(recommendation) === "fallback" ? "fallback" : "live"}
              variant={getSource(recommendation) === "fallback" ? "warn" : "info"}
            />
          ) : null}
          {recommendation && extractModelVersion(recommendation) ? (
            <Badge label={extractModelVersion(recommendation) as string} variant="neutral" />
          ) : null}
          {showViewLink ? (
            <Link href="/admin/ai" className="text-xs font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline">
              View in AI Center
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 inline-flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CircleAlert className="mt-0.5 h-4 w-4" />
          AI insight unavailable: {error}
        </p>
      ) : null}

      {!loading && !error && recommendation ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-[var(--color-text)]">
              Suggested adjustment:{" "}
              <strong>
                {Number(recommendation.pricing_adjustment) > 0 ? "+" : ""}
                {formatPeso(recommendation.pricing_adjustment)}
              </strong>
            </p>
            <p className="text-sm text-[var(--color-text)]">
              Confidence: <strong>{Math.round(Number(recommendation.confidence) * 100)}%</strong>
            </p>
            {recommendation.suggested_multiplier != null ? (
              <p className="text-sm text-[var(--color-text)]">
                Suggested multiplier: <strong>{Number(recommendation.suggested_multiplier).toFixed(3)}x</strong>
              </p>
            ) : null}
            {recommendation.demand_bucket ? (
              <p className="text-sm text-[var(--color-text)]">
                Demand bucket: <strong className="uppercase">{recommendation.demand_bucket}</strong>
              </p>
            ) : null}
          </div>

          {recommendation.explanations.length > 0 ? (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
                Why this recommendation?
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text)]">
                {recommendation.explanations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {recommendation.signal_breakdown && recommendation.signal_breakdown.length > 0 ? (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Signal Breakdown (Full)
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="uppercase tracking-[0.12em] text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-1.5">Signal</th>
                      <th className="px-2 py-1.5">Value</th>
                      <th className="px-2 py-1.5">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.signal_breakdown.map((item) => (
                      <tr key={item.signal} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1.5 text-[var(--color-text)]">{item.signal}</td>
                        <td className="px-2 py-1.5 text-[var(--color-text)]">{Number(item.value).toFixed(3)}</td>
                        <td className="px-2 py-1.5 text-[var(--color-text)]">
                          {Number(item.impact) > 0 ? "+" : ""}
                          {formatPeso(item.impact)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recommendation.confidence_breakdown?.predicted_adjustment !== undefined &&
              recommendation.confidence_breakdown?.explained_sum !== undefined ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Reconciliation: predicted{" "}
                  <strong className="text-[var(--color-text)]">
                    {Number(recommendation.confidence_breakdown.predicted_adjustment) > 0 ? "+" : ""}
                    {formatPeso(recommendation.confidence_breakdown.predicted_adjustment)}
                  </strong>{" "}
                  = explained sum{" "}
                  <strong className="text-[var(--color-text)]">
                    {Number(recommendation.confidence_breakdown.explained_sum) > 0 ? "+" : ""}
                    {formatPeso(recommendation.confidence_breakdown.explained_sum)}
                  </strong>{" "}
                  {Math.abs(Number(recommendation.confidence_breakdown.reconciliation_delta ?? 0)) > 0.01 ? (
                    <> (delta {formatPeso(recommendation.confidence_breakdown.reconciliation_delta ?? 0)})</>
                  ) : null}
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {recommendation.confidence_breakdown ? (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3 text-xs text-[var(--color-muted)]">
              Confidence calc: fit {Math.round((recommendation.confidence_breakdown.model_fit_score ?? 0) * 100)}%
              , raw {Math.round((recommendation.confidence_breakdown.raw_confidence ?? 0) * 100)}%
              , penalty {Math.round((recommendation.confidence_breakdown.zero_adjustment_penalty ?? 0) * 100)}%
              , final <span className="font-semibold text-[var(--color-text)]">{Math.round((recommendation.confidence_breakdown.final_confidence ?? recommendation.confidence) * 100)}%</span>.
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !error && !recommendation && metrics ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
            Requests: <strong className="text-[var(--color-text)]">{metrics.totalRequests ?? 0}</strong>
          </p>
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
            Fallback rate: <strong className="text-[var(--color-text)]">{Math.round((metrics.fallbackRate ?? 0) * 100)}%</strong>
          </p>
          <p className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
            <Timer className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
            P95: <strong className="text-[var(--color-text)]">{Math.round(metrics.p95LatencyMs ?? 0)} ms</strong>
          </p>
          {metrics.generatedAt ? (
            <p className="sm:col-span-3 text-xs text-[var(--color-muted)]">
              Updated {new Date(metrics.generatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {actions ? <div className="mt-3">{actions}</div> : null}
    </section>
  );
}
