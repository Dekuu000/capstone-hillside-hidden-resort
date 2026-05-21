"use client";

import { MapPinned } from "lucide-react";
import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";

export function MapPin({
  pin,
  selected,
  highlighted,
  onSelect,
}: {
  pin: GuestMapAmenityPin;
  selected: boolean;
  highlighted: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(pin.id)}
      data-testid={`map-pin-${pin.id}`}
      aria-pressed={selected}
      aria-label={`Select location ${pin.name}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] font-semibold ${
        selected
          ? "border-[var(--color-secondary)] bg-[var(--color-primary)] text-white"
          : highlighted
            ? "border-[var(--color-primary)] bg-white/95 text-[var(--color-primary)]"
          : pin.kind === "trail"
            ? "border-amber-200 bg-amber-50 text-[var(--color-text)]"
            : "border-white/90 bg-white/90 text-[var(--color-text)]"
      }`}
      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
    >
      <span className="inline-flex items-center gap-1">
        <MapPinned className="h-3 w-3" aria-hidden="true" />
        {pin.name}
      </span>
    </button>
  );
}
