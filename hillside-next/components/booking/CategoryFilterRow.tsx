"use client";

import { BedDouble, Home, LayoutGrid, Tent } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CategoryKey = "all" | "room" | "cottage" | "amenity";

const CATEGORIES: Array<{ key: CategoryKey; label: string; icon: LucideIcon }> = [
  { key: "all", label: "All stays", icon: LayoutGrid },
  { key: "room", label: "Rooms", icon: BedDouble },
  { key: "cottage", label: "Cottages", icon: Tent },
  { key: "amenity", label: "Event spaces", icon: Home },
];

type CategoryFilterRowProps = {
  value: CategoryKey;
  onChange: (next: CategoryKey) => void;
};

export function CategoryFilterRow({ value, onChange }: CategoryFilterRowProps) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {CATEGORIES.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
