"use client";

import { cn } from "../../lib/cn";

export type ScanMode = "scan" | "code" | "queue";

export function ScanSegmentedControl({
  value,
  onChange,
  queueCount = 0,
  showQueue = true,
}: {
  value: ScanMode;
  onChange: (value: ScanMode) => void;
  queueCount?: number;
  showQueue?: boolean;
}) {
  const items: Array<{ id: ScanMode; label: string }> = [
    { id: "scan", label: "Scan" },
    { id: "code", label: "Code" },
    ...(showQueue ? [{ id: "queue" as ScanMode, label: queueCount > 0 ? `Queue (${queueCount})` : "Queue" }] : []),
  ];

  return (
    <div
      className={cn(
        "grid w-full gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-1",
        showQueue ? "grid-cols-3" : "grid-cols-2",
      )}
      role="tablist"
      aria-orientation="horizontal"
    >
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
                : "text-[var(--color-muted)] hover:bg-[var(--color-background)]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
