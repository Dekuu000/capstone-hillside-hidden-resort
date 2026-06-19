"use client";

import { Minus, Plus } from "lucide-react";

type PaxSelectorProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  hint?: string;
  className?: string;
};

export function PaxSelector({
  value,
  onChange,
  min = 1,
  max = 99,
  label = "Guests",
  hint,
  className,
}: PaxSelectorProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className={className}>
      <span className="block text-xs font-semibold uppercase tracking-wide muted-text">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease guests"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text)] transition hover:border-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[2.5ch] text-center text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label="Increase guests"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text)] transition hover:border-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {hint ? <p className="mt-1 text-xs muted-text">{hint}</p> : null}
    </div>
  );
}
