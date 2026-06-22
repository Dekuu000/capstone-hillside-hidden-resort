import { BedDouble, Sparkles, Wrench, AlertTriangle } from "lucide-react";
import type { UnitItem } from "../../../packages/shared/src/types";
import { formatDateTime } from "../../lib/dateDisplay";

function countOperational(units: UnitItem[], status: "cleaned" | "occupied" | "maintenance" | "dirty") {
  return units.filter((unit) => (unit.operational_status || "cleaned") === status).length;
}

export function RoomInventorySyncPanel({ units }: { units: UnitItem[] }) {
  const normalizedUnits = units.map((unit) => ({
    ...unit,
    operational_status: (unit.operational_status || "cleaned") as "cleaned" | "occupied" | "maintenance" | "dirty",
  }));
  const cleaned = countOperational(normalizedUnits, "cleaned");
  const occupied = countOperational(normalizedUnits, "occupied");
  const maintenance = countOperational(normalizedUnits, "maintenance");
  const dirty = countOperational(normalizedUnits, "dirty");
  const total = normalizedUnits.length;

  const latestUpdate = units
    .map((unit) => unit.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const occupiedPct = total > 0 ? (occupied / total) * 100 : 0;
  const cleanedPct = total > 0 ? (cleaned / total) * 100 : 0;
  const dirtyPct = total > 0 ? (dirty / total) * 100 : 0;
  const maintenancePct = total > 0 ? (maintenance / total) * 100 : 0;

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Room Inventory Sync</p>
        <p className="text-[11px] font-semibold whitespace-nowrap text-[var(--color-muted)]">
          {formatDateTime(latestUpdate, {
            locale: "en-PH",
            formatOptions: {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
            fallback: "Unavailable",
          })}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-3 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <Sparkles className="h-4 w-4" />
            </span>
            Cleaned
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{cleaned}</p>
        </article>
        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-3 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-50 text-[var(--color-primary)]">
              <BedDouble className="h-4 w-4" />
            </span>
            Occupied
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{occupied}</p>
        </article>
        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-3 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-orange-500">
              <Wrench className="h-4 w-4" />
            </span>
            Maintenance
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{maintenance}</p>
        </article>
        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-3 transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]">
          <p className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <AlertTriangle className="h-4 w-4" />
            </span>
            Dirty
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{dirty}</p>
        </article>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div className="flex h-full">
            <div className="bg-[var(--color-secondary)]" style={{ width: `${cleanedPct}%` }} />
            <div className="bg-[var(--color-primary)]" style={{ width: `${occupiedPct}%` }} />
            <div className="bg-orange-500" style={{ width: `${maintenancePct}%` }} />
            <div className="bg-rose-500" style={{ width: `${dirtyPct}%` }} />
          </div>
        </div>
        <div className="mt-2 overflow-x-auto">
          <div className="inline-flex min-w-full items-center gap-3 whitespace-nowrap text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-secondary)]" />
              cleaned
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
              occupied
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              dirty
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              maintenance
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}


