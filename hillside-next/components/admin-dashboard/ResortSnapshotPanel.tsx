import Link from "next/link";
import { Activity, BrainCircuit, Coins, Hotel } from "lucide-react";
import type { ResortSnapshotResponse } from "../../../packages/shared/src/types";
import { StatusPill } from "../shared/StatusPill";

function formatPeso(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatAsOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDemandPath(points: Array<{ occupancy_pct: number }>, width = 520, height = 120) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;
  const step = width / (points.length - 1);
  return points
    .map((point, index) => {
      const x = index * step;
      const y = height - (Math.max(0, Math.min(100, point.occupancy_pct)) / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ResortSnapshotPanel({
  snapshot,
  error,
}: {
  snapshot: ResortSnapshotResponse | null;
  error?: string | null;
}) {
  const aiStatus = snapshot?.ai_demand_7d.status ?? "missing";
  const aiTone = aiStatus === "ready" ? "success" : aiStatus === "stale" ? "warn" : "error";
  const aiLabel = aiStatus === "ready" ? "Demand ready" : aiStatus === "stale" ? "Demand stale" : "Demand missing";
  const demandPath = snapshot ? toDemandPath(snapshot.ai_demand_7d.items) : "";

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Resort Snapshot</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">Current occupancy, revenue, and demand</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">As of {snapshot ? formatAsOf(snapshot.as_of) : "Unavailable"}</p>
        </div>
        <StatusPill label={aiLabel} tone={aiTone} />
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Hotel className="h-4 w-4 text-[var(--color-primary)]" />
            Occupancy now
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
            {snapshot ? `${Math.round(snapshot.occupancy.occupancy_rate * 100)}%` : "--"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {snapshot
              ? `${snapshot.occupancy.occupied_units} occupied / ${snapshot.occupancy.active_units} active`
              : "No live occupancy data"}
          </p>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Coins className="h-4 w-4 text-[var(--color-secondary)]" />
            FIAT revenue (7d)
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">{snapshot ? formatPeso(snapshot.revenue.fiat_php_7d) : "--"}</p>
          <p className="text-xs text-[var(--color-muted)]">Settled PHP collection</p>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Activity className="h-4 w-4 text-[var(--color-cta)]" />
            Crypto revenue
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
            {snapshot ? `${snapshot.revenue.crypto_native_total.toFixed(4)} ${snapshot.revenue.crypto_unit}` : "--"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {snapshot ? `${snapshot.revenue.crypto_tx_count} tx • ${snapshot.revenue.crypto_chain_key}` : "No chain activity"}
          </p>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <BrainCircuit className="h-4 w-4 text-[var(--color-secondary)]" />
            AI demand (7d)
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
            {snapshot ? `${snapshot.ai_demand_7d.avg_occupancy_pct}%` : "--"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {snapshot?.ai_demand_7d.peak_date
              ? `Peak ${snapshot.ai_demand_7d.peak_occupancy_pct}% on ${snapshot.ai_demand_7d.peak_date}`
              : "No forecast generated yet"}
          </p>
        </article>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        {snapshot && snapshot.ai_demand_7d.items.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Demand trend next 7 days
              </p>
              <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]">
                {snapshot.ai_demand_7d.model_version || "unknown-model"}
              </span>
            </div>
            <svg viewBox="0 0 520 120" className="h-28 w-full" aria-label="AI demand trend">
              <path d={demandPath} fill="none" stroke="var(--color-secondary)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              {snapshot.ai_demand_7d.items.map((item) => (
                <span key={item.date} className="rounded-full border border-[var(--color-border)] px-2 py-0.5">
                  {item.date.slice(5)} • {item.occupancy_pct}%
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>No AI forecast available yet for the next 7 days.</p>
            <Link
              href="/admin/ai?tab=forecast"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
            >
              Generate forecast in AI Center
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
