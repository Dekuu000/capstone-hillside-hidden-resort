"use client";

export function MapLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        Trail
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        Facility
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-secondary)]" />
        Selected
      </span>
    </div>
  );
}
