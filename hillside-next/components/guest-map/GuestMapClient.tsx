"use client";

import { useEffect, useMemo, useState } from "react";
import { Compass, MapPinned, Route } from "lucide-react";
import { guestMapAmenityPackSchema } from "../../../packages/shared/src/schemas";
import type { GuestMapAmenityPin } from "../../../packages/shared/src/types";
import { formatCachedAt } from "../../lib/dateDisplay";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { InsetPanel } from "../shared/InsetPanel";
import { NetworkStatusBadge } from "../shared/NetworkStatusBadge";
import { Skeleton } from "../shared/Skeleton";
import { StatusPill } from "../shared/StatusPill";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { Tabs } from "../shared/Tabs";
import { loadMapSnapshot, saveMapSnapshot } from "../../lib/offlineSync/store";

const MAP_IMAGE_URL = "/images/resort-map.svg";
const AMENITY_DATA_URL = "/data/guest-map-amenities.json";
const MAP_CACHE_NAME = "guest-map-v2";

const FALLBACK_AMENITIES: GuestMapAmenityPin[] = [
  { id: "lobby", name: "Lobby", description: "Front desk and guest assistance.", x: 18, y: 18, kind: "facility" },
  { id: "pool", name: "Main Pool", description: "Infinity pool and lounge area.", x: 58, y: 24, kind: "facility" },
  { id: "cottages", name: "Cottage Zone", description: "Family cottages and grilling area.", x: 38, y: 54, kind: "facility" },
  { id: "tour", name: "Tour Meet Point", description: "Day/night tour assembly point.", x: 70, y: 62, kind: "trail" },
  { id: "hall", name: "Function Hall", description: "Events and private bookings.", x: 22, y: 74, kind: "facility" },
];

async function loadAmenityPack(): Promise<GuestMapAmenityPin[]> {
  const fallback = FALLBACK_AMENITIES;
  if (!("caches" in window)) return fallback;

  const cache = await caches.open(MAP_CACHE_NAME);
  const fromNetwork = async () => {
    const response = await fetch(AMENITY_DATA_URL, { method: "GET" });
    if (!response.ok) throw new Error("Failed to load amenity pack.");
    const cloned = response.clone();
    await cache.put(AMENITY_DATA_URL, cloned);
    const payload = (await response.json()) as unknown;
    const parsed = guestMapAmenityPackSchema.safeParse(payload);
    if (!parsed.success || parsed.data.amenities.length === 0) return fallback;
    return parsed.data.amenities;
  };

  try {
    if (navigator.onLine) return await fromNetwork();
  } catch {
    // Fallback to cached response.
  }

  const cached = await cache.match(AMENITY_DATA_URL);
  if (cached) {
    const payload = (await cached.json()) as unknown;
    const parsed = guestMapAmenityPackSchema.safeParse(payload);
    if (parsed.success && parsed.data.amenities.length > 0) return parsed.data.amenities;
  }
  return fallback;
}

function buildDirections(origin: GuestMapAmenityPin, destination: GuestMapAmenityPin): string[] {
  if (origin.id === destination.id) {
    return [`You are already at ${destination.name}.`];
  }
  const horizontal = destination.x >= origin.x ? "east" : "west";
  const vertical = destination.y >= origin.y ? "south" : "north";
  const horizontalSteps = Math.max(1, Math.round(Math.abs(destination.x - origin.x) / 8));
  const verticalSteps = Math.max(1, Math.round(Math.abs(destination.y - origin.y) / 8));

  return [
    `From ${origin.name}, move ${horizontal} along the main path for about ${horizontalSteps} marker block(s).`,
    `Turn ${vertical} at the landmark corridor and continue for about ${verticalSteps} marker block(s).`,
    `You should see ${destination.name} ahead.`,
  ];
}

export function GuestMapClient() {
  const [amenities, setAmenities] = useState<GuestMapAmenityPin[]>([]);
  const [activeAmenityId, setActiveAmenityId] = useState<string | null>(null);
  const [originAmenityId, setOriginAmenityId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "trail" | "facility">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedMeta, setCachedMeta] = useState<string | null>(null);
  const networkOnline = useNetworkOnline();

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        if ("caches" in window) {
          const cache = await caches.open(MAP_CACHE_NAME);
          await cache.add(MAP_IMAGE_URL);
        }
        const loaded = await loadAmenityPack();
        setAmenities(loaded);
        setActiveAmenityId((prev) => prev || loaded[0]?.id || null);
        setOriginAmenityId((prev) => prev || loaded[0]?.id || null);
        await saveMapSnapshot("me", { amenities: loaded });
        setCachedMeta(null);
      } catch {
        const cached = await loadMapSnapshot("me");
        if (cached?.data?.amenities?.length) {
          const parsed = guestMapAmenityPackSchema.safeParse({ amenities: cached.data.amenities });
          const nextAmenities =
            parsed.success && parsed.data.amenities.length > 0
              ? parsed.data.amenities
              : FALLBACK_AMENITIES;
          setAmenities(nextAmenities);
          setActiveAmenityId(nextAmenities[0]?.id || null);
          setOriginAmenityId(nextAmenities[0]?.id || null);
          setCachedMeta(`Using cached data from ${formatCachedAt(cached.cached_at)}`);
          setError("Unable to refresh map pack. Showing cached amenity data.");
        } else {
          setAmenities(FALLBACK_AMENITIES);
          setActiveAmenityId(FALLBACK_AMENITIES[0]?.id || null);
          setOriginAmenityId(FALLBACK_AMENITIES[0]?.id || null);
          setError("Unable to refresh map pack. Using fallback data.");
          setCachedMeta(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeAmenity = amenities.find((item) => item.id === activeAmenityId) || null;
  const originAmenity = amenities.find((item) => item.id === originAmenityId) || null;
  const visibleAmenities = useMemo(
    () => (kindFilter === "all" ? amenities : amenities.filter((item) => item.kind === kindFilter)),
    [amenities, kindFilter],
  );
  const directionSteps = useMemo(() => {
    if (!activeAmenity || !originAmenity) return [];
    return buildDirections(originAmenity, activeAmenity);
  }, [activeAmenity, originAmenity]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[320px] w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Resort Navigation (Offline-First)</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Map assets and amenity pack are cached for offline use.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NetworkStatusBadge />
            <StatusPill label="Map cached" tone="info" icon={<Compass className="h-3.5 w-3.5" aria-hidden="true" />} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { id: "all", label: "All" },
              { id: "trail", label: "Trails" },
              { id: "facility", label: "Facilities" },
            ]}
            value={kindFilter}
            onChange={(next) => setKindFilter(next as "all" | "trail" | "facility")}
            ariaLabel="Map pin filter"
            className="w-full max-w-md border-none bg-transparent p-0 sm:grid-cols-3"
            tabClassName="h-9 rounded-full px-3 text-xs"
            activeClassName="border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-text)]"
            inactiveClassName="border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50"
          />
          <span className="text-xs text-[var(--color-muted)] sm:ml-auto">Pins: {visibleAmenities.length}</span>
        </div>
        {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-error)]">{error}</p> : null}
        {cachedMeta ? <p className="guest-surface-soft mt-2 px-3 py-2 text-xs font-semibold text-amber-700">{cachedMeta}</p> : null}
      </section>
      {!networkOnline ? (
        <SyncAlertBanner
          message="Offline mode: map stays available from cached data. New map updates will sync when internet returns."
          showSyncCta
        />
      ) : null}

      <section className="surface overflow-hidden p-3">
        <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MAP_IMAGE_URL}
            alt="Hillside resort static map with amenity pins"
            className="h-auto w-full"
            loading="eager"
          />
          {visibleAmenities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveAmenityId(item.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                item.id === activeAmenityId
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : item.kind === "trail"
                    ? "border-amber-200 bg-amber-50 text-[var(--color-text)]"
                    : "border-white/90 bg-white/90 text-[var(--color-text)]"
              }`}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
            >
              <span className="inline-flex items-center gap-1">
                <MapPinned className="h-3 w-3" aria-hidden="true" />
                {item.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface p-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">Amenity Directory</h3>
          {visibleAmenities.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
              No amenity data available.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {visibleAmenities.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveAmenityId(item.id)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      item.id === activeAmenityId
                        ? "border-[var(--color-secondary)] bg-teal-50"
                        : "border-[var(--color-border)] bg-white"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--color-text)]">{item.name}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{item.description}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                      {item.kind === "trail" ? "Trail point" : "Facility"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <section className="surface p-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">You are here</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Manual selector only (GPS-free MVP).</p>
            <select
              value={originAmenityId || ""}
              onChange={(event) => setOriginAmenityId(event.target.value)}
              className="guest-field-control mt-2"
            >
              {amenities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </section>

          <section className="surface p-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Step Directions</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Route from selected origin to {activeAmenity?.name || "destination"}.
            </p>
            <ul className="mt-3 space-y-2">
              {directionSteps.map((step, index) => (
                <InsetPanel as="li" key={step} className="text-sm text-[var(--color-text)]">
                  <span className="mr-1 font-semibold text-[var(--color-secondary)]">{index + 1}.</span>
                  {step}
                </InsetPanel>
              ))}
            </ul>
            {activeAmenity ? (
              <InsetPanel tone="surface" className="mt-3">
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-text)]">
                  <Route className="h-4 w-4 text-[var(--color-secondary)]" aria-hidden="true" />
                  Destination: {activeAmenity.name}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{activeAmenity.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    Trail
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                    Facility
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
                    Selected
                  </span>
                </div>
              </InsetPanel>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
