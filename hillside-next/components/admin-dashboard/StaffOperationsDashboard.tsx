import { CalendarCheck, ScanLine, UserPlus } from "lucide-react";
import type { OperationsSnapshotResponse } from "../../../packages/shared/src/types";
import { AdminPageHeader } from "../layout/AdminPageHeader";
import { RoomStatusBoard } from "./RoomStatusBoard";

/**
 * Front Desk (staff) home: an operations cockpit for the shift. Deliberately
 * shows no revenue, crypto, or AI internals — just what's actionable now
 * (today's arrivals, check-ins, room housekeeping) plus quick links to the
 * operations tools staff can use.
 */
export function StaffOperationsDashboard({
  snapshot,
  error,
  token = null,
}: {
  snapshot: OperationsSnapshotResponse | null;
  error?: string | null;
  token?: string | null;
}) {
  const kpis = [
    { label: "Arrivals today", value: snapshot?.today_arrivals, icon: CalendarCheck },
    { label: "Ready to check in", value: snapshot?.ready_for_check_in, icon: ScanLine },
    { label: "Walk-ins today", value: snapshot?.walk_ins_today, icon: UserPlus },
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

      <RoomStatusBoard board={snapshot?.room_board ?? []} token={token} />
    </section>
  );
}
