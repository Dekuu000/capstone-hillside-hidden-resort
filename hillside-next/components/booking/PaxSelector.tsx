"use client";

import { useEffect, useRef, useState } from "react";
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

  // Local draft so the guest can clear the field and type a number directly
  // (e.g. "50") instead of tapping + dozens of times. Committed on blur/Enter.
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  // Keep the field in sync when the value changes elsewhere (the +/- buttons),
  // but never overwrite what the guest is actively typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? clamp(parsed) : value;
    onChange(next);
    setDraft(String(next));
  };

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
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`${label} count`}
          value={draft}
          onFocus={(event) => {
            focusedRef.current = true;
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="w-[3.5ch] cursor-text rounded-md border border-transparent bg-transparent text-center text-base font-semibold tabular-nums text-[var(--color-text)] outline-none transition hover:bg-[var(--color-background)] focus:border-[var(--color-border)] focus:bg-white focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
        />
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
