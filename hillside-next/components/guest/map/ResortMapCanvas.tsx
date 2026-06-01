"use client";

import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";
import { MapPin } from "./MapPin";

export function ResortMapCanvas({
  mapImageUrl,
  pins,
  routePins,
  selectedPinId,
  trailEdges,
  routePinIds,
  onSelectPin,
}: {
  mapImageUrl: string;
  pins: GuestMapAmenityPin[];
  routePins?: GuestMapAmenityPin[];
  selectedPinId: string | null;
  trailEdges: Array<{ from: string; to: string }>;
  routePinIds: string[];
  onSelectPin: (id: string) => void;
}) {
  const routePinById = new Map((routePins ?? pins).map((pin) => [pin.id, pin]));
  const routeSegments = routePinIds.slice(0, -1).map((fromId, index) => ({
    fromId,
    toId: routePinIds[index + 1],
  }));

  return (
    <section data-testid="guest-map" className="surface overflow-hidden p-3">
      <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapImageUrl}
          alt="Hillside resort static map with amenity pins"
          className="h-[300px] w-full object-cover sm:h-auto sm:object-contain"
          loading="eager"
        />
        <svg
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {trailEdges.map((edge) => {
            const from = routePinById.get(edge.from);
            const to = routePinById.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(14, 165, 164, 0.35)"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
            );
          })}
          {routeSegments.map((segment) => {
            const from = routePinById.get(segment.fromId);
            const to = routePinById.get(segment.toId);
            if (!from || !to) return null;
            return (
              <line
                key={`route-${segment.fromId}-${segment.toId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(11, 31, 59, 0.95)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {pins.map((pin) => (
          <MapPin
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedPinId}
            highlighted={routePinIds.includes(pin.id)}
            onSelect={onSelectPin}
          />
        ))}
      </div>
    </section>
  );
}
