"use client";

import { type KeyboardEvent, type ReactNode, useMemo } from "react";
import { cn } from "../../lib/cn";

export type TabItem = {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
};

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const activeIndex = useMemo(
    () => Math.max(0, items.findIndex((item) => item.id === value)),
    [items, value],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    if (items.length === 0) return;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (activeIndex + direction + items.length) % items.length;
    const next = items[nextIndex];
    if (next) onChange(next.id);
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn("grid gap-2 rounded-2xl border border-[var(--color-border)] bg-slate-50 p-1 sm:grid-cols-3", className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`tab-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm",
              active
                ? "border border-[var(--color-border)] bg-white text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-muted)] hover:bg-slate-100",
            )}
          >
            {item.icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{item.icon}</span> : null}
            <span className="truncate sm:hidden">{item.shortLabel ?? item.label}</span>
            <span className="hidden truncate sm:inline">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
