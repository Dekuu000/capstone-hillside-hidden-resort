"use client";

import type { GuestMapAmenityPin } from "../../../../packages/shared/src/types";
import { MapPin } from "./MapPin";

export function ResortMapCanvas({
  mapImageUrl,
  pins,
  routePins,
  selectedPinId,
  originPinId = null,
  trailEdges,
  routePinIds,
  onSelectPin,
}: {
  mapImageUrl: string;
  pins: GuestMapAmenityPin[];
  routePins?: GuestMapAmenityPin[];
  selectedPinId: string | null;
  originPinId?: string | null;
  trailEdges: Array<{ from: string; to: string }>;
  routePinIds: string[];
  onSelectPin: (id: string) => void;
}) {
  const routePinById = new Map((routePins ?? pins).map((pin) => [pin.id, pin]));
  const routeSegments = routePinIds.slice(0, -1).map((fromId, index) => ({
    fromId,
    toId: routePinIds[index + 1],
  }));
  const waypoints = routePinIds
    .map((id) => routePinById.get(id))
    .filter((pin): pin is GuestMapAmenityPin => Boolean(pin));

  return (
    <section data-testid="guest-map" className="surface overflow-hidden p-3">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapImageUrl}
          alt="Illustrated Hillside resort map with amenity pins"
          className="h-[360px] w-full object-cover sm:h-auto sm:object-contain"
          loading="eager"
        />
        <svg
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Faint network of all walkable connections */}
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
                stroke="rgba(181, 97, 58, 0.3)"
                strokeWidth="0.7"
                strokeLinecap="round"
              />
            );
          })}
          {/* Active route: white halo under a solid line so it always reads clearly */}
          {routeSegments.map((segment) => {
            const from = routePinById.get(segment.fromId);
            const to = routePinById.get(segment.toId);
            if (!from || !to) return null;
            return (
              <line
                key={`halo-${segment.fromId}-${segment.toId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
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
                stroke="var(--color-primary)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {/* Waypoint dots along the route */}
          {waypoints.map((pin) => (
            <circle key={`wp-${pin.id}`} cx={pin.x} cy={pin.y} r="0.9" fill="var(--color-primary)" />
          ))}
        </svg>
        {pins.map((pin) => (
          <MapPin
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedPinId}
            highlighted={routePinIds.includes(pin.id)}
            isOrigin={pin.id === originPinId}
            onSelect={onSelectPin}
          />
        ))}
      </div>
    </section>
  );
}
