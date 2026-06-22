"use client";

import { useMemo, useState } from "react";
import { MountainSnow } from "lucide-react";
import type { PublicUnit } from "../../lib/catalog";
import { CategoryFilterRow, type CategoryKey } from "./CategoryFilterRow";
import { ListingCard } from "./ListingCard";

export function HomeListings({ units }: { units: PublicUnit[] }) {
  const [category, setCategory] = useState<CategoryKey>("all");

  const filtered = useMemo(
    () => (category === "all" ? units : units.filter((unit) => unit.type === category)),
    [category, units],
  );

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-6 md:py-12 lg:px-8">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Find your perfect stay</h2>
        <p className="muted-text text-sm md:text-base">
          Handpicked rooms, cottages, and event spaces nestled in the hills of Olongapo.
        </p>
      </div>

      <div className="mb-6">
        <CategoryFilterRow value={category} onChange={setCategory} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[var(--color-border)] py-16 text-center">
          <MountainSnow className="h-8 w-8 text-[var(--color-muted)]" />
          <p className="muted-text text-sm">No stays in this category yet. Try another category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((unit, index) => (
            <ListingCard key={unit.unit_id} unit={unit} priority={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}
