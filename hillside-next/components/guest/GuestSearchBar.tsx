"use client";

import { Search, X } from "lucide-react";

type GuestSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
};

export function GuestSearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Search booking, unit, or date",
  className,
}: GuestSearchBarProps) {
  return (
    <label data-testid="guest-search" className={className}>
      <span className="sr-only">Search bookings</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          aria-label="Search reservations"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-[3.25rem] w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm text-[var(--color-text)] shadow-sm outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-teal-100 placeholder:text-slate-400 md:h-12"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </label>
  );
}
