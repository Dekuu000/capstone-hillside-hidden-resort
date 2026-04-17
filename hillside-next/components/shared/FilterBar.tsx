"use client";

import type { ChangeEvent } from "react";
import { cn } from "../../lib/cn";

type Option = { label: string; value: string };

type FilterBarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  statusValue?: string;
  statusOptions?: Option[];
  onStatusChange?: (value: string) => void;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function FilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  statusValue = "",
  statusOptions,
  onStatusChange,
  dateValue = "",
  onDateChange,
  rightSlot,
  className,
}: FilterBarProps) {
  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => onSearchChange?.(event.target.value);
  const handleStatus = (event: ChangeEvent<HTMLSelectElement>) => onStatusChange?.(event.target.value);
  const handleDate = (event: ChangeEvent<HTMLInputElement>) => onDateChange?.(event.target.value);

  return (
    <div className={cn("surface flex flex-wrap items-end gap-3 p-3", className)}>
      <label className="min-w-[220px] flex-1">
        <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">Search</span>
        <input
          value={searchValue}
          onChange={handleSearch}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
        />
      </label>
      {statusOptions ? (
        <label className="w-full min-w-[180px] flex-1 sm:w-auto">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">Status</span>
          <select
            value={statusValue}
            onChange={handleStatus}
            className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {onDateChange ? (
        <label className="w-full min-w-[170px] flex-1 sm:w-auto">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">Date</span>
          <input
            type="date"
            value={dateValue}
            onChange={handleDate}
            className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          />
        </label>
      ) : null}
      {rightSlot ? <div className="ml-auto">{rightSlot}</div> : null}
    </div>
  );
}
