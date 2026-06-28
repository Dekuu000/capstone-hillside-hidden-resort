import { z } from "zod";
import { serviceListResponseSchema, unitReviewsResponseSchema } from "../../packages/shared/src/schemas";
import type { ServiceItem, UnitReviewsResponse } from "../../packages/shared/src/types";

/**
 * Public catalog access (no auth) + presentation helpers for the Airbnb-style
 * browse experience. Backed by GET /v2/catalog/units, /units/available, /services.
 */

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");

export const publicUnitSchema = z.object({
  unit_id: z.string(),
  name: z.string(),
  unit_code: z.string().nullable().optional(),
  type: z.string(),
  description: z.string().nullable().optional(),
  base_price: z.number(),
  capacity: z.number(),
  image_url: z.string().nullable().optional(),
  image_urls: z.array(z.string()).nullable().optional(),
  image_thumb_urls: z.array(z.string()).nullable().optional(),
  amenities: z.array(z.string()).nullable().optional(),
});

export type PublicUnit = z.infer<typeof publicUnitSchema>;

const publicUnitsResponseSchema = z.object({
  items: z.array(publicUnitSchema),
  count: z.number(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  has_more: z.boolean().optional(),
});

const availableUnitsResponseSchema = z.object({
  items: z.array(publicUnitSchema),
  count: z.number(),
  check_in_date: z.string().optional(),
  check_out_date: z.string().optional(),
});

/** Server-side fetch of the public catalog. Returns [] on any failure (page degrades gracefully). */
export async function fetchPublicUnits(params?: {
  unitType?: string;
  limit?: number;
}): Promise<PublicUnit[]> {
  if (!apiBase) return [];
  const search = new URLSearchParams();
  if (params?.unitType) search.set("unit_type", params.unitType);
  search.set("limit", String(params?.limit ?? 60));
  try {
    const res = await fetch(`${apiBase}/v2/catalog/units?${search.toString()}`, {
      // Short ISR window: serve cached catalog for 60s, then revalidate in the
      // background. This keeps the landing/stays pages fast even when the (free-tier)
      // API is cold-starting — visitors get the cached page instead of blocking on a
      // ~50s wake-up — while photo/price edits still appear within ~1 minute.
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const parsed = publicUnitsResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

/** Server-side availability check for a date range. Returns null on failure. */
export async function fetchAvailableUnits(params: {
  checkInDate: string;
  checkOutDate: string;
  unitType?: string;
}): Promise<PublicUnit[] | null> {
  if (!apiBase) return null;
  const search = new URLSearchParams({
    check_in_date: params.checkInDate,
    check_out_date: params.checkOutDate,
  });
  if (params.unitType) search.set("unit_type", params.unitType);
  try {
    const res = await fetch(`${apiBase}/v2/catalog/units/available?${search.toString()}`, {
      // Short ISR window (see fetchPublicUnits) — keeps search fast against the
      // cold-startable free-tier API; availability edits reflect within ~1 minute.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const parsed = availableUnitsResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.items : null;
  } catch {
    return null;
  }
}

export async function fetchPublicUnitById(unitId: string): Promise<PublicUnit | null> {
  const units = await fetchPublicUnits({ limit: 100 });
  return units.find((unit) => unit.unit_id === unitId) ?? null;
}

/** Public reviews + summary for a unit. Returns an empty summary on any failure
 * (e.g. the reviews table isn't provisioned yet), so the listing degrades cleanly. */
export async function fetchUnitReviews(unitId: string): Promise<UnitReviewsResponse> {
  const empty: UnitReviewsResponse = {
    unit_id: unitId,
    summary: { average_rating: 0, review_count: 0 },
    items: [],
  };
  if (!apiBase) return empty;
  try {
    const res = await fetch(`${apiBase}/v2/catalog/units/${encodeURIComponent(unitId)}/reviews`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return empty;
    const parsed = unitReviewsResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : empty;
  } catch {
    return empty;
  }
}

// --- Presentation helpers ---

export function unitTypeLabel(type: string): string {
  switch (type) {
    case "room":
      return "Room";
    case "cottage":
      return "Cottage";
    case "amenity":
      return "Event space";
    default:
      return type ? type[0].toUpperCase() + type.slice(1) : "Stay";
  }
}

const IMAGES_BY_TYPE: Record<string, string[]> = {
  room: [
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267",
    "https://images.unsplash.com/photo-1611892440504-42a792e24d32",
  ],
  cottage: [
    "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8",
    "https://images.unsplash.com/photo-1518780664697-55e3ad937233",
    "https://images.unsplash.com/photo-1542718610-a1d656d1884c",
  ],
  amenity: [
    "https://images.unsplash.com/photo-1530541930197-ff16ac917b0e",
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3",
  ],
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
];

function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return mod > 0 ? h % mod : 0;
}

/** A real photo if the unit has one, else a deterministic nature/cabin placeholder. */
export function unitImageUrl(unit: Pick<PublicUnit, "unit_id" | "type" | "image_url" | "image_urls">): string {
  const candidate = (unit.image_urls || []).find(Boolean) || unit.image_url || "";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const pool = IMAGES_BY_TYPE[unit.type] || FALLBACK_IMAGES;
  const base = pool[stableIndex(unit.unit_id, pool.length)];
  return `${base}?auto=format&fit=crop&w=1200&q=80`;
}

/** A small gallery set: real photos if present, else the unit-type placeholder pool. */
export function unitGalleryImages(unit: PublicUnit): string[] {
  const real = (unit.image_urls || []).filter((u) => /^https?:\/\//i.test(u));
  if (real.length > 0) return real;
  const pool = IMAGES_BY_TYPE[unit.type] || FALLBACK_IMAGES;
  return [...pool, ...FALLBACK_IMAGES].map((base) => `${base}?auto=format&fit=crop&w=1200&q=80`);
}

// --- Tours (public day-pass / activity catalog) ---

/** Public list of active tour/day-pass services. Returns [] on failure. */
export async function fetchPublicServices(): Promise<ServiceItem[]> {
  if (!apiBase) return [];
  try {
    // Short ISR window (see fetchPublicUnits) — fast loads against the cold-startable
    // free-tier API; newly uploaded tour photos/edits appear within ~1 minute.
    const res = await fetch(`${apiBase}/v2/catalog/services`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const parsed = serviceListResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

export async function fetchPublicServiceById(serviceId: string): Promise<ServiceItem | null> {
  const items = await fetchPublicServices();
  return items.find((service) => service.service_id === serviceId) ?? null;
}

const TOUR_IMAGES = [
  "https://images.unsplash.com/photo-1551632811-561732d1e306",
  "https://images.unsplash.com/photo-1533240332313-0db49b459ad6",
  "https://images.unsplash.com/photo-1473773508845-188df298d2d1",
  "https://images.unsplash.com/photo-1510312305653-8ed496efae75",
  "https://images.unsplash.com/photo-1501555088652-021faa106b9b",
];

/** A real uploaded photo if the tour has one, else a deterministic placeholder. */
export function tourImageUrl(service: Pick<ServiceItem, "service_id" | "image_urls">): string {
  const real = (service.image_urls || []).find((u) => /^https?:\/\//i.test(u || ""));
  if (real) return real;
  const base = TOUR_IMAGES[stableIndex(service.service_id, TOUR_IMAGES.length)];
  return `${base}?auto=format&fit=crop&w=1200&q=80`;
}

/** Uploaded photos if the tour has any, else the placeholder pool. */
export function tourGalleryImages(service?: Pick<ServiceItem, "image_urls">): string[] {
  const real = (service?.image_urls || []).filter((u) => /^https?:\/\//i.test(u || ""));
  if (real.length > 0) return real;
  return TOUR_IMAGES.map((base) => `${base}?auto=format&fit=crop&w=1200&q=80`);
}

/** "15:00:00" -> "3:00 PM". Returns "" for missing/invalid times. */
export function formatTime12(value?: string | null): string {
  if (!value) return "";
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw ?? "", 10);
  if (Number.isNaN(hour)) return "";
  const minutes = (minuteRaw ?? "00").padStart(2, "0").slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes} ${period}`;
}

/** "8:00 AM – 5:00 PM" from "HH:MM:SS" times, or a friendly fallback. */
export function tourSchedule(service: Pick<ServiceItem, "start_time" | "end_time">): string {
  const start = formatTime12(service.start_time);
  const end = formatTime12(service.end_time);
  return start && end ? `${start} – ${end}` : "Flexible schedule";
}
