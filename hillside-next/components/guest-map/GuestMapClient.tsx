"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Route } from "lucide-react";
import { guestMapAmenityPackSchema } from "../../../packages/shared/src/schemas";
import type { GuestMapAmenityPin } from "../../../packages/shared/src/types";
import { formatCachedAt } from "../../lib/dateDisplay";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { NetworkStatusBadge } from "../shared/NetworkStatusBadge";
import { Select } from "../shared/Select";
import { Skeleton } from "../shared/Skeleton";
import { StatusPill } from "../shared/StatusPill";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { Tabs } from "../shared/Tabs";
import { loadMapSnapshot, saveMapSnapshot } from "../../lib/offlineSync/store";
import { guestMapLocations } from "../../data/guestMapLocations";
import { guestTrailEdges } from "../../data/guestMapGraph";
import { MapDirectionsPanel } from "../guest/map/MapDirectionsPanel";
import { ResortMapCanvas } from "../guest/map/ResortMapCanvas";

const MAP_IMAGE_URL = "/images/resort-map.svg";
const AMENITY_DATA_URL = "/data/guest-map-amenities.json";
const MAP_CACHE_NAME = "guest-map-v3";

const FALLBACK_AMENITIES: GuestMapAmenityPin[] = guestMapLocations;
// Resort is compact; keep ETA estimates short and practical for on-site walking.
const WALK_MINUTES_SCALE = 0.08;
const WALK_MINUTES_MAX = 9;

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

function distanceBetween(a: GuestMapAmenityPin, b: GuestMapAmenityPin) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function shortestPath(
  startId: string | null,
  endId: string | null,
  pins: GuestMapAmenityPin[],
): string[] {
  if (!startId || !endId) return [];
  if (startId === endId) return [startId];

  const pinById = new Map(pins.map((pin) => [pin.id, pin]));
  if (!pinById.has(startId) || !pinById.has(endId)) return [];

  const neighbors = new Map<string, Array<{ id: string; weight: number }>>();
  const ensure = (id: string) => {
    if (!neighbors.has(id)) neighbors.set(id, []);
  };

  for (const edge of guestTrailEdges) {
    const from = pinById.get(edge.from);
    const to = pinById.get(edge.to);
    if (!from || !to) continue;
    const weight = distanceBetween(from, to);
    ensure(from.id);
    ensure(to.id);
    neighbors.get(from.id)?.push({ id: to.id, weight });
    neighbors.get(to.id)?.push({ id: from.id, weight });
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>(Array.from(pinById.keys()));
  for (const id of unvisited) {
    dist.set(id, id === startId ? 0 : Number.POSITIVE_INFINITY);
    prev.set(id, null);
  }

  while (unvisited.size > 0) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of unvisited) {
      const next = dist.get(id) ?? Number.POSITIVE_INFINITY;
      if (next < best) {
        best = next;
        current = id;
      }
    }
    if (!current || current === endId || !Number.isFinite(best)) break;
    unvisited.delete(current);
    for (const next of neighbors.get(current) ?? []) {
      if (!unvisited.has(next.id)) continue;
      const candidate = (dist.get(current) ?? Number.POSITIVE_INFINITY) + next.weight;
      if (candidate < (dist.get(next.id) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next.id, candidate);
        prev.set(next.id, current);
      }
    }
  }

  const path: string[] = [];
  let walk: string | null = endId;
  while (walk) {
    path.unshift(walk);
    walk = prev.get(walk) ?? null;
  }
  return path[0] === startId ? path : [];
}

function routeDistance(path: string[], pinById: Map<string, GuestMapAmenityPin>): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = pinById.get(path[index]);
    const to = pinById.get(path[index + 1]);
    if (!from || !to) continue;
    total += distanceBetween(from, to);
  }
  return total;
}

function routeSteps(path: string[], pinById: Map<string, GuestMapAmenityPin>) {
  if (path.length <= 1) return ["You are already at your selected destination."];
  const steps: string[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = pinById.get(path[index]);
    const to = pinById.get(path[index + 1]);
    if (!from || !to) continue;
    steps.push(`Walk from ${from.name} toward ${to.name}.`);
  }
  const destination = pinById.get(path[path.length - 1]);
  if (destination) {
    steps.push(`You have arrived at ${destination.name}.`);
  }
  return steps;
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

  const filteredAmenities = useMemo(
    () => (kindFilter === "all" ? amenities : amenities.filter((item) => item.kind === kindFilter)),
    [amenities, kindFilter],
  );
  const pinById = useMemo(
    () => new Map(amenities.map((item) => [item.id, item])),
    [amenities],
  );
  const activeAmenity = pinById.get(activeAmenityId ?? "") || null;
  const originAmenity = pinById.get(originAmenityId ?? "") || null;

  useEffect(() => {
    if (!filteredAmenities.length) return;
    if (!activeAmenityId || !filteredAmenities.some((pin) => pin.id === activeAmenityId)) {
      setActiveAmenityId(filteredAmenities[0].id);
    }
  }, [filteredAmenities, activeAmenityId]);

  useEffect(() => {
    if (!filteredAmenities.length) return;
    if (!originAmenityId || !filteredAmenities.some((pin) => pin.id === originAmenityId)) {
      setOriginAmenityId(filteredAmenities[0].id);
    }
  }, [filteredAmenities, originAmenityId]);

  const pathPinIds = useMemo(
    () => shortestPath(originAmenityId, activeAmenityId, amenities),
    [originAmenityId, activeAmenityId, amenities],
  );
  const directionSteps = useMemo(
    () => routeSteps(pathPinIds, pinById),
    [pathPinIds, pinById],
  );
  const etaMinutes = useMemo(() => {
    if (pathPinIds.length < 2) return 0;
    const totalDistance = routeDistance(pathPinIds, pinById);
    return Math.min(
      WALK_MINUTES_MAX,
      Math.max(1, Math.round(totalDistance * WALK_MINUTES_SCALE)),
    );
  }, [pathPinIds, pinById]);
  const swapRoutePoints = () => {
    if (!originAmenityId || !activeAmenityId) return;
    setOriginAmenityId(activeAmenityId);
    setActiveAmenityId(originAmenityId);
  };

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
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Getting around the resort</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Walking directions between trails and facilities.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NetworkStatusBadge />
            {etaMinutes > 0 ? (
              <StatusPill
                label={`~${etaMinutes} min walk`}
                tone="success"
                icon={<Route className="h-3.5 w-3.5" aria-hidden="true" />}
              />
            ) : null}
          </div>
        </div>

        <div id="route-controls" className="mt-3">
          <Tabs
            items={[
              { id: "all", label: "All" },
              { id: "trail", label: "Trails" },
              { id: "facility", label: "Facilities" },
            ]}
            value={kindFilter}
            onChange={(next) => setKindFilter(next as "all" | "trail" | "facility")}
            ariaLabel="Map pin filter"
            className="w-full grid-cols-3 border-none bg-transparent p-0 sm:max-w-md sm:grid-cols-3"
            tabClassName="h-11 rounded-2xl px-3 text-sm font-semibold"
            activeClassName="border border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] text-[var(--color-secondary)] shadow-sm"
            inactiveClassName="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-background)]"
          />
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <label className="guest-form-label">
            I am here
            <Select
              ariaLabel="Starting point"
              value={originAmenityId || ""}
              onChange={setOriginAmenityId}
              options={filteredAmenities.map((item) => ({ value: item.id, label: item.name }))}
            />
          </label>
          <button
            type="button"
            onClick={swapRoutePoints}
            className="guest-secondary-cta h-10 px-3 sm:mb-[1px]"
            aria-label="Swap start and destination"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="text-xs font-semibold">Swap</span>
          </button>
          <label className="guest-form-label">
            Take me to
            <Select
              ariaLabel="Destination"
              value={activeAmenityId || ""}
              onChange={setActiveAmenityId}
              options={filteredAmenities.map((item) => ({ value: item.id, label: item.name }))}
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-error)]">
            {error}
          </p>
        ) : null}
        {cachedMeta ? (
          <p className="guest-surface-soft mt-2 px-3 py-2 text-xs font-semibold text-amber-700">
            {cachedMeta}
          </p>
        ) : null}
      </section>

      {!networkOnline ? (
        <SyncAlertBanner
          message="Offline mode: map and directions stay available from cached data. New map updates will sync when internet returns."
          showSyncCta
        />
      ) : null}

      <ResortMapCanvas
        mapImageUrl={MAP_IMAGE_URL}
        pins={filteredAmenities}
        routePins={amenities}
        selectedPinId={activeAmenityId}
        originPinId={originAmenityId}
        trailEdges={guestTrailEdges}
        routePinIds={pathPinIds}
        onSelectPin={setActiveAmenityId}
      />

      <MapDirectionsPanel
        origin={originAmenity}
        destination={activeAmenity}
        estimatedMinutes={etaMinutes || null}
        steps={directionSteps}
      />
    </div>
  );
}
