"use client";

import { cn } from "../../lib/cn";

export type ScanMode = "scan" | "code" | "queue";

export function ScanSegmentedControl({
  value,
  onChange,
  queueCount = 0,
}: {
  value: ScanMode;
  onChange: (value: ScanMode) => void;
  queueCount?: number;
}) {
  const items: Array<{ id: ScanMode; label: string }> = [
    { id: "scan", label: "Scan" },
    { id: "code", label: "Code" },
    { id: "queue", label: queueCount > 0 ? `Queue (${queueCount})` : "Queue" },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border)] bg-slate-50 p-1" role="tablist" aria-orientation="horizontal">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "h-10 rounded-xl text-xs font-semibold transition sm:h-11 sm:text-sm",
              active
                ? "border border-[var(--color-border)] bg-white text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-muted)] hover:bg-slate-100",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
