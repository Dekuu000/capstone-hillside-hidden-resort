"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Clock, Eye, EyeOff, ImageOff, Loader2, Moon, Sun, Trash2 } from "lucide-react";
import type { ServiceItem } from "../../../packages/shared/src/types";
import { serviceItemSchema, serviceListResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { tourSchedule } from "../../lib/catalog";
import { deleteManagedUnitImageUrls, normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "../shared/Skeleton";
import { useToast } from "../shared/ToastProvider";
import { UnitPhotoUploader } from "../shared/UnitPhotoUploader";

type Props = {
  accessToken: string | null;
};

function tourTypeLabel(type?: string | null): string {
  if (type === "day_tour") return "Day Tour";
  if (type === "night_tour") return "Night Tour";
  return "Tour";
}

export function AdminToursClient({ accessToken }: Props) {
  const { showToast } = useToast();
  const [tours, setTours] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Per-tour rate inputs (kept as strings so the fields can be cleared/typed).
  const [rateInputs, setRateInputs] = useState<Record<string, { adult: string; kid: string }>>({});
  const [savingDetailsId, setSavingDetailsId] = useState<string | null>(null);

  const seedRateInputs = useCallback((items: ServiceItem[]) => {
    setRateInputs(
      Object.fromEntries(
        items.map((t) => [
          t.service_id,
          { adult: String(t.adult_rate ?? ""), kid: String(t.kid_rate ?? "") },
        ]),
      ),
    );
  }, []);

  const loadTours = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(
        "/v2/admin/services/catalog",
        { method: "GET" },
        accessToken,
        serviceListResponseSchema,
      );
      setTours(data.items ?? []);
      seedRateInputs(data.items ?? []);
    } catch (unknownError) {
      setTours([]);
      setError(getApiErrorMessage(unknownError, "Failed to load tours."));
    } finally {
      setLoading(false);
    }
  }, [accessToken, seedRateInputs]);

  useEffect(() => {
    void loadTours();
  }, [loadTours]);

  // Persist the gallery for one tour and reconcile state with the server row.
  const persistImages = useCallback(
    async (serviceId: string, imageUrls: string[], thumbUrls: string[]) => {
      if (!accessToken) return;
      setSavingId(serviceId);
      try {
        const row = await apiFetch(
          `/v2/admin/services/catalog/${encodeURIComponent(serviceId)}/images`,
          {
            method: "PATCH",
            body: JSON.stringify({ image_urls: imageUrls, image_thumb_urls: thumbUrls }),
          },
          accessToken,
          serviceItemSchema,
        );
        setTours((prev) => prev.map((tour) => (tour.service_id === serviceId ? row : tour)));
      } catch (unknownError) {
        showToast({
          type: "error",
          title: "Save failed",
          message: getApiErrorMessage(unknownError, "Could not save tour photos."),
        });
        // Re-sync from the server so the UI never shows un-saved state.
        void loadTours();
      } finally {
        setSavingId(null);
      }
    },
    [accessToken, loadTours, showToast],
  );

  const handleUploaded = useCallback(
    (tour: ServiceItem, uploaded: { mediumUrl: string; thumbUrl: string }[]) => {
      const currentImages = normalizeUnitImageUrls(tour.image_urls);
      const currentThumbs = normalizeUnitThumbUrls(currentImages, tour.image_thumb_urls);
      const nextImages = [...currentImages, ...uploaded.map((u) => u.mediumUrl)];
      const nextThumbs = [...currentThumbs, ...uploaded.map((u) => u.thumbUrl)];
      // Optimistic update so the new photos appear immediately.
      setTours((prev) =>
        prev.map((row) =>
          row.service_id === tour.service_id
            ? { ...row, image_urls: nextImages, image_thumb_urls: nextThumbs }
            : row,
        ),
      );
      void persistImages(tour.service_id, nextImages, nextThumbs);
    },
    [persistImages],
  );

  const handleRemove = useCallback(
    async (tour: ServiceItem, index: number) => {
      const currentImages = normalizeUnitImageUrls(tour.image_urls);
      const currentThumbs = normalizeUnitThumbUrls(currentImages, tour.image_thumb_urls);
      const removedImage = currentImages[index];
      const removedThumb = currentThumbs[index];
      const nextImages = currentImages.filter((_, i) => i !== index);
      const nextThumbs = currentThumbs.filter((_, i) => i !== index);

      setTours((prev) =>
        prev.map((row) =>
          row.service_id === tour.service_id
            ? { ...row, image_urls: nextImages, image_thumb_urls: nextThumbs }
            : row,
        ),
      );
      await persistImages(tour.service_id, nextImages, nextThumbs);
      // Best-effort storage cleanup (the row is already saved without these URLs).
      if (accessToken) {
        void deleteManagedUnitImageUrls(
          accessToken,
          [removedImage, removedThumb].filter(Boolean) as string[],
        ).catch(() => undefined);
      }
    },
    [accessToken, persistImages],
  );

  // Save editable tour fields (rates / visibility) and reconcile with the server.
  const persistDetails = useCallback(
    async (serviceId: string, body: { adult_rate?: number; kid_rate?: number; status?: "active" | "inactive" }) => {
      if (!accessToken) return;
      setSavingDetailsId(serviceId);
      try {
        const row = await apiFetch(
          `/v2/admin/services/catalog/${encodeURIComponent(serviceId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
          accessToken,
          serviceItemSchema,
        );
        setTours((prev) => prev.map((tour) => (tour.service_id === serviceId ? row : tour)));
        setRateInputs((prev) => ({
          ...prev,
          [serviceId]: { adult: String(row.adult_rate ?? ""), kid: String(row.kid_rate ?? "") },
        }));
        showToast({ type: "success", title: "Tour updated", message: "Your changes are saved." });
      } catch (unknownError) {
        showToast({
          type: "error",
          title: "Save failed",
          message: getApiErrorMessage(unknownError, "Could not save tour changes."),
        });
      } finally {
        setSavingDetailsId(null);
      }
    },
    [accessToken, showToast],
  );

  const handleSaveRates = useCallback(
    (tour: ServiceItem) => {
      const input = rateInputs[tour.service_id] ?? { adult: "", kid: "" };
      const adult = Number(input.adult);
      const kid = Number(input.kid);
      if (!Number.isFinite(adult) || adult < 0 || !Number.isFinite(kid) || kid < 0) {
        showToast({ type: "error", title: "Invalid price", message: "Enter valid adult and kid rates." });
        return;
      }
      void persistDetails(tour.service_id, { adult_rate: adult, kid_rate: kid });
    },
    [persistDetails, rateInputs, showToast],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface p-4">
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadTours()}
          className="mt-3 inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!tours.length) {
    return (
      <EmptyState
        title="No tours yet"
        description="Day Tour and Night Tour packages will appear here once they're set up."
      />
    );
  }

  return (
    <div className="space-y-4">
      {tours.map((tour) => {
        const images = normalizeUnitImageUrls(tour.image_urls);
        const thumbs = normalizeUnitThumbUrls(images, tour.image_thumb_urls);
        const isNight = tour.service_type === "night_tour";
        const TypeIcon = isNight ? Moon : Sun;
        const adultRate = Number(tour.adult_rate || 0);
        const rate = rateInputs[tour.service_id] ?? {
          adult: String(tour.adult_rate ?? ""),
          kid: String(tour.kid_rate ?? ""),
        };
        const isActive = (tour.status ?? "active") !== "inactive";
        const detailsBusy = savingDetailsId === tour.service_id;

        return (
          <section key={tour.service_id} className="surface space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    isNight ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  <TypeIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[var(--color-text)]">{tour.service_name}</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[var(--color-muted)]">
                    <span>{tourTypeLabel(tour.service_type)}</span>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {tourSchedule(tour)}
                    </span>
                    {adultRate > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{formatPhpPeso(adultRate)} / adult</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                    <EyeOff className="h-3.5 w-3.5" />
                    Hidden
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                  {images.length} photo{images.length === 1 ? "" : "s"}
                  {savingId === tour.service_id ? " · saving…" : ""}
                </span>
              </div>
            </div>

            {/* Pricing & visibility */}
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
                Adult rate (₱)
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate.adult}
                  onChange={(e) =>
                    setRateInputs((prev) => ({
                      ...prev,
                      [tour.service_id]: { ...rate, adult: e.target.value.replace(/[^0-9.]/g, "") },
                    }))
                  }
                  className="h-10 w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
                Kid rate (₱)
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate.kid}
                  onChange={(e) =>
                    setRateInputs((prev) => ({
                      ...prev,
                      [tour.service_id]: { ...rate, kid: e.target.value.replace(/[^0-9.]/g, "") },
                    }))
                  }
                  className="h-10 w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => handleSaveRates(tour)}
                disabled={detailsBusy}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {detailsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save prices
              </button>
              <button
                type="button"
                onClick={() => persistDetails(tour.service_id, { status: isActive ? "inactive" : "active" })}
                disabled={detailsBusy}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
              >
                {isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {isActive ? "Hide from guests" : "Show to guests"}
              </button>
            </div>

            {images.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((src, index) => (
                  <li key={`${src}-${index}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
                    <Image
                      src={thumbs[index] || src}
                      alt={`${tour.service_name} photo ${index + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRemove(tour, index)}
                      disabled={savingId === tour.service_id}
                      aria-label={`Remove photo ${index + 1}`}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {index === 0 ? (
                      <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text)] shadow-sm">
                        Cover
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-4 text-sm text-[var(--color-muted)]">
                <ImageOff className="h-4 w-4" />
                No photos yet — guests see a stock image until you upload one.
              </div>
            )}

            {accessToken ? (
              <UnitPhotoUploader
                token={accessToken}
                unitId={tour.service_id}
                folder="tours"
                currentCount={images.length}
                onUploaded={(uploaded) => handleUploaded(tour, uploaded)}
                onUploadFailed={(fileName, reason) =>
                  showToast({ type: "error", title: "Upload failed", message: `${fileName}: ${reason}` })
                }
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
