import Link from "next/link";
import { Activity, BrainCircuit, Coins, Hotel } from "lucide-react";
import type { ResortSnapshotResponse } from "../../../packages/shared/src/types";
import { formatDateTime } from "../../lib/dateDisplay";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { StatusPill } from "../shared/StatusPill";

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
  canSeeTechnical = false,
}: {
  snapshot: ResortSnapshotResponse | null;
  error?: string | null;
  /** System Admin only: show on-chain/crypto + AI model-version internals. */
  canSeeTechnical?: boolean;
}) {
  const aiStatus = snapshot?.ai_demand_7d.status ?? "missing";
  const aiTone = aiStatus === "ready" ? "success" : aiStatus === "stale" ? "warn" : "error";
  const aiLabel = aiStatus === "ready" ? "Demand ready" : aiStatus === "stale" ? "Demand stale" : "Demand missing";
  const demandPath = snapshot ? toDemandPath(snapshot.ai_demand_7d.items) : "";
  const occupancyPercent = snapshot ? Math.round(snapshot.occupancy.occupancy_rate * 100) : null;
  const remainingCleanable = snapshot ? Math.max(snapshot.occupancy.active_units - snapshot.occupancy.occupied_units, 0) : null;
  const compactPeso = snapshot
    ? new Intl.NumberFormat("en-PH", {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 1,
      }).format(snapshot.revenue.fiat_php_7d)
    : "--";

  return (
    <section className="surface p-5 sm:p-6 lg:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">Resort Snapshot</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)] lg:text-2xl">Current occupancy, revenue, and demand</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            As of{" "}
            {snapshot
              ? formatDateTime(snapshot.as_of, {
                  locale: "en-PH",
                  formatOptions: {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  },
                  fallback: "Unavailable",
                })
              : "Unavailable"}
          </p>
        </div>
        {/* Demand-model status is AI-internal — System Admin only. */}
        {canSeeTechnical ? <StatusPill label={aiLabel} tone={aiTone} /> : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className={`mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 ${canSeeTechnical ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Coins className="h-4 w-4" />
            </span>
            Cash revenue · 7d
          </p>
          <p className="mt-2 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">{snapshot ? formatPeso(snapshot.revenue.fiat_php_7d) : "--"}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Settled in 7d ({compactPeso})</p>
        </article>

        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-[var(--color-primary)]">
              <Hotel className="h-4 w-4" />
            </span>
            Occupancy now
          </p>
          <p className="mt-2 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
            {occupancyPercent !== null ? `${occupancyPercent}%` : "--"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {snapshot
              ? `${snapshot.occupancy.occupied_units}/${snapshot.occupancy.active_units} occupied`
              : "No live occupancy data"}
          </p>
        </article>

        {canSeeTechnical ? (
          <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-50 text-[var(--color-cta)]">
                <Activity className="h-4 w-4" />
              </span>
              Crypto revenue
            </p>
            <p className="mt-2 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
              {snapshot ? `${snapshot.revenue.crypto_native_total.toFixed(4)} ${snapshot.revenue.crypto_unit}` : "--"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {snapshot ? `${snapshot.revenue.crypto_tx_count} tx · ${snapshot.revenue.crypto_chain_key.toUpperCase()}` : "No chain activity"}
            </p>
          </article>
        ) : null}

        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <BrainCircuit className="h-4 w-4" />
            </span>
            AI demand · 7d
          </p>
          <p className="mt-2 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
            {snapshot ? `${snapshot.ai_demand_7d.avg_occupancy_pct}%` : "--"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {snapshot?.ai_demand_7d.peak_date
              ? `Peak ${snapshot.ai_demand_7d.peak_occupancy_pct}% · ${snapshot.ai_demand_7d.peak_date}`
              : "No forecast generated yet"}
          </p>
        </article>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border border-[var(--color-border)] bg-white p-3 text-xs text-[var(--color-muted)]">
        <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 font-semibold text-[var(--color-text)]">
          Active units: {snapshot?.occupancy.active_units ?? "--"}
        </span>
        <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 font-semibold text-[var(--color-text)]">
          Vacant now: {remainingCleanable ?? "--"}
        </span>
        {canSeeTechnical ? (
          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 font-semibold text-[var(--color-text)]">
            Chain: {snapshot?.revenue.crypto_chain_key ?? "sepolia"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        {snapshot && snapshot.ai_demand_7d.items.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Demand trend next 7 days</p>
              {canSeeTechnical ? (
                <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]">
                  {snapshot.ai_demand_7d.model_version || "unknown-model"}
                </span>
              ) : null}
            </div>
            <svg viewBox="0 0 520 120" className="h-28 w-full" aria-label="AI demand trend">
              <path d={demandPath} fill="none" stroke="var(--color-secondary)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              {snapshot.ai_demand_7d.items.map((item) => (
                <span key={item.date} className="rounded-full border border-[var(--color-border)] px-2 py-0.5">
                  {item.date.slice(5)} | {item.occupancy_pct}%
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


