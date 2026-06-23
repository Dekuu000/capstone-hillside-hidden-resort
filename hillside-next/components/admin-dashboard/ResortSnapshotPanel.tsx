import Link from "next/link";
import { Activity, BrainCircuit, Coins, Hotel } from "lucide-react";
import type { ResortSnapshotResponse } from "../../../packages/shared/src/types";
import { formatDateTime } from "../../lib/dateDisplay";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";

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
  const aiLabel = aiStatus === "ready" ? "Demand ready" : aiStatus === "stale" ? "Demand stale" : "Demand missing";
  const aiToneClass = aiStatus === "ready" ? "text-emerald-700" : aiStatus === "stale" ? "text-amber-700" : "text-red-700";
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
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">Resort Snapshot</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)] lg:text-2xl">Current occupancy, revenue, and demand</h2>
          <div className="mt-1 flex items-center justify-between gap-3 sm:justify-start">
            <p className="text-sm text-[var(--color-muted)]">
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
            {/* Mobile: demand status sits beside the timestamp. AI-internal — System Admin only. */}
            {canSeeTechnical ? (
              <span className={`shrink-0 text-xs font-semibold sm:hidden ${aiToneClass}`}>{aiLabel}</span>
            ) : null}
          </div>
        </div>
        {/* Desktop: demand status kept at the top of the header. */}
        {canSeeTechnical ? (
          <span className={`hidden shrink-0 text-xs font-semibold sm:inline ${aiToneClass}`}>{aiLabel}</span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className={`mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 ${canSeeTechnical ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Coins className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted)]">Cash revenue · 7d</p>
          <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">{snapshot ? formatPeso(snapshot.revenue.fiat_php_7d) : "--"}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted)]">Settled in 7d ({compactPeso})</p>
        </article>

        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-[var(--color-primary)]">
            <Hotel className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted)]">Occupancy now</p>
          <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
            {occupancyPercent !== null ? `${occupancyPercent}%` : "--"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted)]">
            {snapshot
              ? `${snapshot.occupancy.occupied_units}/${snapshot.occupancy.active_units} occupied`
              : "No live occupancy data"}
          </p>
        </article>

        {canSeeTechnical ? (
          <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-50 text-[var(--color-cta)]">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted)]">Crypto revenue</p>
            <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
              {snapshot ? `${snapshot.revenue.crypto_native_total.toFixed(4)} ${snapshot.revenue.crypto_unit}` : "--"}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted)]">
              {snapshot ? `${snapshot.revenue.crypto_tx_count} tx · ${snapshot.revenue.crypto_chain_key.toUpperCase()}` : "No chain activity"}
            </p>
          </article>
        ) : null}

        <article className="group h-full min-h-[92px] rounded-2xl border border-[var(--color-border)] bg-white p-3.5 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
            <BrainCircuit className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted)]">AI demand · 7d</p>
          <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-2xl">
            {snapshot ? `${snapshot.ai_demand_7d.avg_occupancy_pct}%` : "--"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted)]">
            {snapshot?.ai_demand_7d.peak_date
              ? `Peak ${snapshot.ai_demand_7d.peak_occupancy_pct}% · ${snapshot.ai_demand_7d.peak_date}`
              : "No forecast generated yet"}
          </p>
        </article>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
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
            {/* Per-day bars: fill the width and keep the date + % aligned under
                each bar on desktop and mobile alike. */}
            <div className="mt-3 flex items-end justify-between gap-1 sm:gap-2">
              {snapshot.ai_demand_7d.items.map((item) => {
                const pct = Math.max(0, Math.min(100, Math.round(item.occupancy_pct)));
                return (
                  <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-[var(--color-text)] sm:text-xs">{pct}%</span>
                    <div className="relative flex h-24 w-full max-w-[40px] items-end overflow-hidden rounded-md bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:h-28">
                      <div
                        className="w-full rounded-md bg-[var(--color-secondary)] transition-[height] duration-500"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-[var(--color-muted)] sm:text-xs">{item.date.slice(5)}</span>
                  </div>
                );
              })}
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


