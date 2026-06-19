"use client";

import { Flag, MapPinned } from "lucide-react";
import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";

export function MapPin({
  pin,
  selected,
  highlighted,
  isOrigin = false,
  onSelect,
}: {
  pin: GuestMapAmenityPin;
  selected: boolean;
  highlighted: boolean;
  isOrigin?: boolean;
  onSelect: (id: string) => void;
}) {
  const base = "absolute -translate-x-1/2 -translate-y-1/2";
  const labelled = selected || highlighted || isOrigin;

  // Off-route pins are compact markers so labels never crowd the map or route.
  if (!labelled) {
    return (
      <button
        type="button"
        onClick={() => onSelect(pin.id)}
        data-testid={`map-pin-${pin.id}`}
        aria-label={`Select location ${pin.name}`}
        title={pin.name}
        className={`${base} z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--color-surface)] text-[var(--color-muted)] shadow-[var(--shadow-sm)] transition hover:scale-110 hover:text-[var(--color-secondary)]`}
        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
      >
        <MapPinned className="h-3 w-3" aria-hidden="true" />
      </button>
    );
  }

  const tone = selected
    ? "z-30 border-transparent bg-[var(--color-cta)] text-white"
    : isOrigin
      ? "z-20 border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
      : "z-20 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";

  return (
    <button
      type="button"
      onClick={() => onSelect(pin.id)}
      data-testid={`map-pin-${pin.id}`}
      aria-pressed={selected}
      aria-label={`Select location ${pin.name}`}
      className={`${base} inline-flex max-w-[160px] items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold shadow-[var(--shadow-sm)] sm:text-[11px] ${tone}`}
      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
    >
      {selected ? (
        <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : isOrigin ? (
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-white" aria-hidden="true" />
      ) : (
        <MapPinned className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{isOrigin && !selected ? `Start · ${pin.name}` : pin.name}</span>
    </button>
  );
}
