"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { PublicUnit } from "../../lib/catalog";
import { getUnitNightlyRate } from "../../lib/booking/pricing";
import { CategoryFilterRow, type CategoryKey } from "./CategoryFilterRow";
import { ListingCard } from "./ListingCard";
import { MapPlaceholder } from "./MapPlaceholder";

type SortKey = "recommended" | "price_asc" | "price_desc" | "capacity";

const SORT_LABELS: Record<SortKey, string> = {
  recommended: "Recommended",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  capacity: "Largest groups",
};

type StaysResultsProps = {
  units: PublicUnit[];
  checkIn?: string;
  checkOut?: string;
  guests: number;
  initialType?: CategoryKey;
  datesApplied: boolean;
};

export function StaysResults({
  units,
  checkIn,
  checkOut,
  guests,
  initialType = "all",
  datesApplied,
}: StaysResultsProps) {
  const [category, setCategory] = useState<CategoryKey>(initialType);
  const [sort, setSort] = useState<SortKey>("recommended");

  const linkQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (checkIn) params.set("check_in", checkIn);
    if (checkOut) params.set("check_out", checkOut);
    if (guests) params.set("guests", String(guests));
    return params.toString();
  }, [checkIn, checkOut, guests]);

  const visible = useMemo(() => {
    const filtered = category === "all" ? units : units.filter((u) => u.type === category);
    const rate = (u: PublicUnit) => getUnitNightlyRate(u, guests);
    const sorted = [...filtered];
    if (sort === "price_asc") sorted.sort((a, b) => rate(a) - rate(b));
    else if (sort === "price_desc") sorted.sort((a, b) => rate(b) - rate(a));
    else if (sort === "capacity") sorted.sort((a, b) => b.capacity - a.capacity);
    return sorted;
  }, [category, guests, sort, units]);

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 pb-12 md:px-6 lg:px-8">
      <div className="mb-5">
        <CategoryFilterRow value={category} onChange={setCategory} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {visible.length} {visible.length === 1 ? "stay" : "stays"}
              {datesApplied ? " available" : ""}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <SlidersHorizontal className="h-4 w-4 text-[var(--color-muted)]" />
              <span className="sr-only">Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--color-border)] py-16 text-center">
              <p className="muted-text text-sm">
                No stays match your search. Try different dates or another category.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2">
              {visible.map((unit, index) => (
                <ListingCard key={unit.unit_id} unit={unit} query={linkQuery} priority={index < 2} />
              ))}
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-24">
            <MapPlaceholder className="h-[70vh]" />
          </div>
        </div>
      </div>
    </section>
  );
}
