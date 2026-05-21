"use client";

import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";
import { InsetPanel } from "../../shared/InsetPanel";
import { MapLegend } from "./MapLegend";

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
    <section className="surface p-4">
      <h3 className="text-base font-semibold text-[var(--color-text)]">Route guidance</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Tap a map pin to set destination. Use this card for quick walking directions.
      </p>
      {origin && destination ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Route: <span className="font-semibold text-[var(--color-text)]">{origin.name}</span> to{" "}
          <span className="font-semibold text-[var(--color-text)]">{destination.name}</span>
          {estimatedMinutes ? ` • about ${estimatedMinutes} min walk` : ""}
        </p>
      ) : null}
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
