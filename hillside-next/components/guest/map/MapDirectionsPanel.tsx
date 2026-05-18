"use client";

import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";
import { InsetPanel } from "../../shared/InsetPanel";
import { MapLegend } from "./MapLegend";

export function MapDirectionsPanel({
  destination,
  steps,
}: {
  destination: GuestMapAmenityPin | null;
  steps: string[];
}) {
  return (
    <section className="surface p-4">
      <h3 className="text-base font-semibold text-[var(--color-text)]">Step Directions</h3>
      <ul className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <InsetPanel as="li" key={step} className="text-sm text-[var(--color-text)]">
            <span className="mr-1 font-semibold text-[var(--color-text)]">{index + 1}.</span>
            {step}
          </InsetPanel>
        ))}
      </ul>
      {destination ? (
        <InsetPanel tone="surface" className="mt-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">Destination: {destination.name}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{destination.description}</p>
          <MapLegend />
        </InsetPanel>
      ) : null}
    </section>
  );
}
