import Link from "next/link";
import type { ComponentType } from "react";
import { Sparkles, UtensilsCrossed, UserRound } from "lucide-react";
import type { ResortSnapshotResponse } from "../../../packages/shared/src/types";

type Team = {
  key: "housekeeping" | "kitchen" | "front_desk";
  label: string;
  icon: ComponentType<{ className?: string }>;
  factor: number;
};

const TEAMS: Team[] = [
  { key: "housekeeping", label: "Housekeeping", icon: Sparkles, factor: 1.0 },
  { key: "kitchen", label: "Kitchen", icon: UtensilsCrossed, factor: 0.85 },
  { key: "front_desk", label: "Front Desk", icon: UserRound, factor: 0.7 },
];

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function toneForValue(value: number) {
  if (value >= 80) return "bg-teal-500 text-white";
  if (value >= 60) return "bg-teal-200 text-teal-900";
  if (value >= 40) return "bg-cyan-100 text-cyan-900";
  if (value >= 20) return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

function computeTeamLoad(occupancyPct: number, factor: number) {
  return Math.max(0, Math.min(100, Math.round(occupancyPct * factor)));
}

export function ResourceHeatmapPanel({ snapshot }: { snapshot: ResortSnapshotResponse | null }) {
  const demandRows = snapshot?.ai_demand_7d.items ?? [];
  const peak = demandRows.reduce<{ date: string; value: number } | null>((acc, item) => {
    if (!acc || item.occupancy_pct > acc.value) return { date: item.date, value: item.occupancy_pct };
    return acc;
  }, null);

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Resource Heatmap</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">Guest concentration by team load</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Use this to plan housekeeping, kitchen prep, and front desk staffing.</p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
          Avg occupancy {snapshot?.ai_demand_7d.avg_occupancy_pct ?? 0}%
        </span>
      </div>

      {demandRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-muted)]">
          No 7-day forecast available yet. Generate forecast to activate resource heatmap.
          <div className="mt-3">
            <Link
              href="/admin/ai?tab=forecast"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
            >
              Open AI Forecast
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Team</th>
                  {demandRows.map((row) => (
                    <th key={row.date} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em]">
                      {formatShortDate(row.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEAMS.map((team) => {
                  const Icon = team.icon;
                  return (
                    <tr key={team.key} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-text)]">
                          <Icon className="h-4 w-4 text-[var(--color-secondary)]" />
                          {team.label}
                        </span>
                      </td>
                      {demandRows.map((row) => {
                        const loadPct = computeTeamLoad(row.occupancy_pct, team.factor);
                        return (
                          <td key={`${team.key}-${row.date}`} className="px-2 py-2 text-center">
                            <span className={`inline-flex min-w-[52px] items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${toneForValue(loadPct)}`}>
                              {loadPct}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Peak load window:{" "}
            <span className="font-semibold text-[var(--color-text)]">
              {peak ? `${formatShortDate(peak.date)} (${peak.value}% demand)` : "Unavailable"}
            </span>
          </p>
        </>
      )}
    </section>
  );
}
