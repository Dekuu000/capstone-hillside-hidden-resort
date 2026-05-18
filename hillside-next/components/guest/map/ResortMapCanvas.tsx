"use client";

import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";
import { MapPin } from "./MapPin";

export function ResortMapCanvas({
  mapImageUrl,
  pins,
  selectedPinId,
  onSelectPin,
}: {
  mapImageUrl: string;
  pins: GuestMapAmenityPin[];
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
}) {
  return (
    <section data-testid="guest-map" className="surface overflow-hidden p-3">
      <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapImageUrl}
          alt="Hillside resort static map with amenity pins"
          className="h-auto w-full"
          loading="eager"
        />
        {pins.map((pin) => (
          <MapPin
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedPinId}
            onSelect={onSelectPin}
          />
        ))}
      </div>
    </section>
  );
}
