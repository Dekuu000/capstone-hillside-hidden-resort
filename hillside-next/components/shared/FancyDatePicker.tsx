"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type FancyDatePickerProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  allowClear?: boolean;
  popoverAlign?: "start" | "end";
};

const WEEK_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoDate(value: string) {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
}

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function FancyDatePicker({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = "mm/dd/yyyy",
  allowClear = false,
  popoverAlign = "start",
}: FancyDatePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => parseIsoDate(value), [value]);
  const minDate = useMemo(() => (min ? parseIsoDate(min) : null), [min]);
  const maxDate = useMemo(() => (max ? parseIsoDate(max) : null), [max]);
  const selectedOrToday = selected ?? new Date();

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(selectedOrToday.getFullYear(), selectedOrToday.getMonth(), 1));
  const [focusedDate, setFocusedDate] = useState<Date>(selectedOrToday);

  useEffect(() => {
    const next = parseIsoDate(value) ?? new Date();
    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setFocusedDate(next);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const days = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  function isDisabled(date: Date) {
    if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  }

  const displayValue = selected
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      }).format(selected)
    : placeholder;

  function clampToRange(date: Date) {
    if (minDate && date < minDate) return minDate;
    if (maxDate && date > maxDate) return maxDate;
    return date;
  }

  function moveFocusByDays(delta: number) {
    const next = new Date(focusedDate);
    next.setDate(next.getDate() + delta);
    const clamped = clampToRange(next);
    setFocusedDate(clamped);
    setViewMonth(new Date(clamped.getFullYear(), clamped.getMonth(), 1));
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocusByDays(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocusByDays(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocusByDays(-7);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocusByDays(7);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isDisabled(focusedDate)) return;
      onChange(toIso(focusedDate));
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const popoverPositionClass = popoverAlign === "end" ? "right-0" : "left-0";

  return (
    <div ref={rootRef} className="relative">
      <label className="grid gap-1 text-sm text-[var(--color-text)]">
        {label}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
        >
          <span className="inline-flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--color-muted)]" />
            {displayValue}
          </span>
        </button>
      </label>

      {open ? (
        <div
          ref={popoverRef}
          className={`absolute ${popoverPositionClass} z-30 mt-2 w-[300px] max-w-[calc(100vw-1rem)] rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-lg)]`}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          role="dialog"
          aria-label={`${label} calendar`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(viewMonth)}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEK_LABELS.map((day) => (
              <span key={day} className="py-1 text-center text-xs font-semibold text-[var(--color-muted)]">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const outsideMonth = date.getMonth() !== viewMonth.getMonth();
              const disabled = isDisabled(date);
              const active = selected ? sameDay(date, selected) : false;
              const keyboardFocused = sameDay(date, focusedDate);
              return (
                <button
                  key={toIso(date)}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    onChange(toIso(date));
                    setOpen(false);
                  }}
                  onFocus={() => setFocusedDate(date)}
                  disabled={disabled}
                  className={`h-9 rounded-lg text-sm transition ${
                    active
                      ? "bg-[var(--color-primary)] font-semibold text-white"
                      : outsideMonth
                        ? "text-slate-300"
                        : "text-[var(--color-text)] hover:bg-[var(--color-background)]"
                  } ${keyboardFocused ? "ring-2 ring-[var(--color-secondary)]/45 ring-offset-1" : ""} ${disabled ? "cursor-not-allowed opacity-30" : ""}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <div className="flex items-center gap-3">
              {allowClear ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs font-semibold text-[var(--color-muted)]"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  if (isDisabled(today)) return;
                  onChange(toIso(today));
                  setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  setOpen(false);
                }}
                className="text-xs font-semibold text-[var(--color-secondary)]"
              >
                Today
              </button>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-[var(--color-muted)]">
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
