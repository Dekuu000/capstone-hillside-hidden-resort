import { BedDouble, CalendarCheck, ScanLine, UserPlus } from "lucide-react";
import type { OperationsSnapshotResponse } from "../../../packages/shared/src/types";
import { AdminPageHeader } from "../layout/AdminPageHeader";

/**
 * Front Desk (staff) home: an operations cockpit for the shift. Deliberately
 * shows no revenue, crypto, or AI internals — just what's actionable now
 * (today's arrivals, check-ins, room housekeeping) plus quick links to the
 * operations tools staff can use.
 */
export function StaffOperationsDashboard({
  snapshot,
  error,
}: {
  snapshot: OperationsSnapshotResponse | null;
  error?: string | null;
}) {
  const rooms = snapshot?.rooms;

  const kpis = [
    { label: "Arrivals today", value: snapshot?.today_arrivals, icon: CalendarCheck },
    { label: "Ready to check in", value: snapshot?.ready_for_check_in, icon: ScanLine },
    { label: "Walk-ins today", value: snapshot?.walk_ins_today, icon: UserPlus },
  ];

  const roomStats = [
    { label: "Cleaned", value: rooms?.cleaned, tone: "text-emerald-600" },
    { label: "Occupied", value: rooms?.occupied, tone: "text-[var(--color-primary)]" },
    { label: "Dirty", value: rooms?.dirty, tone: "text-amber-600" },
    { label: "Maintenance", value: rooms?.maintenance, tone: "text-red-600" },
  ];

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5 pb-2">
      <AdminPageHeader
        eyebrow="Front Desk"
        title="Today's Operations"
        subtitle="Arrivals, check-ins, and room status for your shift."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.label} className="surface flex items-center gap-3 p-3.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-[-0.01em] text-[var(--color-text)]">{kpi.value ?? "--"}</p>
                <p className="text-xs text-[var(--color-muted)]">{kpi.label}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="surface p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <BedDouble className="h-4 w-4 text-[var(--color-secondary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Room status{rooms ? ` · ${rooms.total} active` : ""}
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {roomStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[var(--color-border)] bg-white p-3 text-center">
              <p className={`text-2xl font-bold ${stat.tone}`}>{stat.value ?? "--"}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
