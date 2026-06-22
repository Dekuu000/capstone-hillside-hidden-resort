"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "../../lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build a YYYY-MM-DD string (the picker's value format). */
function toISODate(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseISODate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function formatDisplay(value: string): string {
  const parsed = parseISODate(value);
  if (!parsed) return "";
  return new Date(parsed.y, parsed.m, parsed.d).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DatePickerProps = {
  /** YYYY-MM-DD, or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Disable dates before this (YYYY-MM-DD). */
  minDate?: string;
};

/**
 * Branded date picker with an inline calendar that expands in place (never a
 * native popup, so it can't clip/overflow inside a modal). Matches the app's
 * calm surfaces + teal accent, and works the same on desktop and mobile.
 */
export function DatePicker({ value, onChange, placeholder = "Select date", ariaLabel, minDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseISODate(value);

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<{ y: number; m: number }>(() =>
    selected ? { y: selected.y, m: selected.m } : { y: today.getFullYear(), m: today.getMonth() },
  );

  // Jump the calendar to the selected month each time it opens.
  useEffect(() => {
    if (open && selected) setView({ y: selected.y, m: selected.m });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const goPrev = () =>
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const goNext = () =>
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const isSelected = (d: number) =>
    selected && selected.y === view.y && selected.m === view.m && selected.d === d;
  const isToday = (d: number) =>
    today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
  const isDisabled = (d: number) => Boolean(minDate) && toISODate(view.y, view.m, d) < (minDate as string);

  const pick = (d: number) => {
    if (isDisabled(d)) return;
    onChange(toISODate(view.y, view.m, d));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex h-11 w-full items-center gap-2 rounded-xl border bg-white px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]",
          open ? "border-[var(--color-secondary)]" : "border-[var(--color-border)] hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
        <span className={cn("flex-1 truncate", value ? "font-medium text-[var(--color-text)]" : "text-[var(--color-muted)]")}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onChange("");
              }
            }}
            className="rounded-full p-0.5 text-[var(--color-muted)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-md)]"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-[var(--color-text)]">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) =>
              d === null ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(d)}
                  disabled={isDisabled(d)}
                  aria-pressed={Boolean(isSelected(d))}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-lg text-sm transition",
                    isSelected(d)
                      ? "bg-[var(--color-primary)] font-semibold text-white"
                      : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]",
                    !isSelected(d) && isToday(d) ? "ring-1 ring-inset ring-[var(--color-secondary)]" : "",
                    isDisabled(d) ? "cursor-not-allowed text-[var(--color-border)] hover:bg-transparent" : "",
                  )}
                >
                  {d}
                </button>
              ),
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                setView({ y: t.getFullYear(), m: t.getMonth() });
                if (!(minDate && toISODate(t.getFullYear(), t.getMonth(), t.getDate()) < minDate)) {
                  onChange(toISODate(t.getFullYear(), t.getMonth(), t.getDate()));
                  setOpen(false);
                }
              }}
              className="text-xs font-semibold text-[var(--color-secondary)] transition hover:underline"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
