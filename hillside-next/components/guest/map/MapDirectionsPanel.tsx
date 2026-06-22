"use client";

import { ArrowRight, Flag, Footprints } from "lucide-react";
import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";

export function MapDirectionsPanel({
  origin,
  destination,
  estimatedMinutes,
  steps,
}: {
  origin: GuestMapAmenityPin | null;
  destination: GuestMapAmenityPin | null;
  estimatedMinutes: number | null;
  steps: string[];
}) {
  return (
    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
      <h3 className="text-base font-semibold text-[var(--color-text)]">Walking directions</h3>

      {origin && destination ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl bg-[var(--color-background)] px-3 py-2.5 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-text)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
            {origin.name}
          </span>
          <ArrowRight className="h-4 w-4 text-[var(--color-muted)]" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-cta)]">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            {destination.name}
          </span>
          {estimatedMinutes ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--color-primary)_12%,white)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">
              <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
              ~{estimatedMinutes} min walk
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Pick a start and destination above to see step-by-step walking directions.
        </p>
      )}

      {steps.length ? (
        <ol className="mt-4">
          {steps.map((step, index) => (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 ? (
                <span
                  className="absolute left-[13px] top-8 h-[calc(100%-1.5rem)] w-px bg-[var(--color-border)]"
                  aria-hidden="true"
                />
              ) : null}
              <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
                {index + 1}
              </span>
              <p className="pt-1 text-sm leading-snug text-[var(--color-text)]">{step}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {destination ? (
        <div className="mt-2 rounded-2xl bg-[var(--color-background)] p-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">{destination.name}</p>
          {destination.description ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{destination.description}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
