"use client";

import { ExternalLink, MapPin, Navigation, WifiOff } from "lucide-react";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";

const RESORT_NAME = "Hillside Hidden Resort";
const RESORT_ADDRESS = "Prk. 7, Jupiter St, Olongapo City, 2200 Zambales";
const MAPS_QUERY = encodeURIComponent(`${RESORT_NAME}, ${RESORT_ADDRESS}`);
const EMBED_SRC = `https://www.google.com/maps?q=${MAPS_QUERY}&output=embed`;
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${MAPS_QUERY}`;
const VIEW_URL = `https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`;

/**
 * "Find us" map. Shows the real Google map of the resort address when online;
 * falls back to a tidy offline notice (the offline resort guide below stays
 * fully usable without internet).
 */
export function ResortLocationMap() {
  const online = useNetworkOnline();

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <div className="relative aspect-[16/11] w-full bg-[var(--color-background)] sm:aspect-[21/9]">
        {online ? (
          <iframe
            title="Hillside Hidden Resort location"
            src={EMBED_SRC}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <WifiOff className="h-6 w-6" />
            </span>
            <p className="font-semibold text-[var(--color-text)]">Live map needs internet</p>
            <p className="max-w-sm text-sm muted-text">
              You&apos;re offline. Use the resort guide below to find your way around — it works without a connection.
              Directions to the resort open in Google Maps once you&apos;re back online.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--color-text)]">{RESORT_NAME}</p>
            <p className="text-sm muted-text">{RESORT_ADDRESS}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <a
            href={DIRECTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3 text-sm font-semibold text-white transition hover:brightness-95 sm:gap-2 sm:px-4"
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
            Get directions
          </a>
          <a
            href={VIEW_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] sm:gap-2 sm:px-4"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            Open in Maps
          </a>
        </div>
      </div>
    </section>
  );
}
