"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Clock, Eye, EyeOff, ImageOff, Moon, Settings2, Sun, Trash2 } from "lucide-react";
import type { ServiceItem } from "../../../packages/shared/src/types";
import { serviceItemSchema, serviceListResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { tourSchedule } from "../../lib/catalog";
import { deleteManagedUnitImageUrls, normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";
import { EmptyState } from "../shared/EmptyState";
import { Modal } from "../shared/Modal";
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
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Editor (Manage modal) — changes are staged here and only committed on Save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAdult, setEditAdult] = useState("");
  const [editKid, setEditKid] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editThumbs, setEditThumbs] = useState<string[]>([]);
  const [originImages, setOriginImages] = useState<string[]>([]);
  const [originThumbs, setOriginThumbs] = useState<string[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);
  const [uploadQueueCount, setUploadQueueCount] = useState(0);

  const editingTour = tours.find((t) => t.service_id === editingId) ?? null;

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
    } catch (unknownError) {
      setTours([]);
      setError(getApiErrorMessage(unknownError, "Failed to load tours."));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTours();
  }, [loadTours]);

  const openEditor = useCallback((tour: ServiceItem) => {
    const images = normalizeUnitImageUrls(tour.image_urls);
    const thumbs = normalizeUnitThumbUrls(images, tour.image_thumb_urls);
    setEditAdult(String(tour.adult_rate ?? ""));
    setEditKid(String(tour.kid_rate ?? ""));
    setEditImages(images);
    setEditThumbs(thumbs);
    setOriginImages(images);
    setOriginThumbs(thumbs);
    setUploadQueueCount(0);
    setEditingId(tour.service_id);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingId(null);
    setEditImages([]);
    setEditThumbs([]);
    setOriginImages([]);
    setOriginThumbs([]);
    setUploadQueueCount(0);
  }, []);

  // Uploaded files land in storage immediately, but are only STAGED here — the
  // tour record isn't updated until Save changes (matching the unit editor).
  const handleUploadedMedia = useCallback((uploads: { mediumUrl: string; thumbUrl: string }[]) => {
    if (!uploads.length) return;
    setEditImages((prev) => [...prev, ...uploads.map((u) => u.mediumUrl)]);
    setEditThumbs((prev) => [...prev, ...uploads.map((u) => u.thumbUrl)]);
  }, []);

  const removeEditImage = useCallback((index: number) => {
    setEditImages((prev) => prev.filter((_, i) => i !== index));
    setEditThumbs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editingId || !accessToken) return;
    const adult = Number(editAdult);
    const kid = Number(editKid);
    if (!Number.isFinite(adult) || adult < 0 || !Number.isFinite(kid) || kid < 0) {
      showToast({ type: "error", title: "Invalid price", message: "Enter valid adult and kid rates." });
      return;
    }
    setEditorBusy(true);
    try {
      const images = editImages.filter(Boolean);
      const thumbs = normalizeUnitThumbUrls(images, editThumbs);
      const id = editingId;
      await apiFetch(
        `/v2/admin/services/catalog/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify({ adult_rate: adult, kid_rate: kid }) },
        accessToken,
        serviceItemSchema,
      );
      const row = await apiFetch(
        `/v2/admin/services/catalog/${encodeURIComponent(id)}/images`,
        { method: "PATCH", body: JSON.stringify({ image_urls: images, image_thumb_urls: thumbs }) },
        accessToken,
        serviceItemSchema,
      );
      setTours((prev) => prev.map((t) => (t.service_id === id ? row : t)));

      // Best-effort cleanup of photos removed during this edit.
      const removed = [
        ...originImages.filter((u) => !images.includes(u)),
        ...originThumbs.filter((u) => !thumbs.includes(u)),
      ];
      if (removed.length) {
        void deleteManagedUnitImageUrls(accessToken, removed).catch(() => undefined);
      }

      showToast({ type: "success", title: "Tour updated", message: "Your changes are saved." });
      closeEditor();
    } catch (unknownError) {
      showToast({
        type: "error",
        title: "Save failed",
        message: getApiErrorMessage(unknownError, "Could not save tour changes."),
      });
    } finally {
      setEditorBusy(false);
    }
  }, [accessToken, closeEditor, editAdult, editImages, editKid, editThumbs, editingId, originImages, originThumbs, showToast]);

  const toggleVisibility = useCallback(
    async (tour: ServiceItem) => {
      if (!accessToken) return;
      const isActive = (tour.status ?? "active") !== "inactive";
      setTogglingId(tour.service_id);
      try {
        const row = await apiFetch(
          `/v2/admin/services/catalog/${encodeURIComponent(tour.service_id)}`,
          { method: "PATCH", body: JSON.stringify({ status: isActive ? "inactive" : "active" }) },
          accessToken,
          serviceItemSchema,
        );
        setTours((prev) => prev.map((t) => (t.service_id === tour.service_id ? row : t)));
      } catch (unknownError) {
        showToast({
          type: "error",
          title: "Update failed",
          message: getApiErrorMessage(unknownError, "Could not update visibility."),
        });
      } finally {
        setTogglingId(null);
      }
    },
    [accessToken, showToast],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
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
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tours.map((tour) => {
          const images = normalizeUnitImageUrls(tour.image_urls);
          const thumbs = normalizeUnitThumbUrls(images, tour.image_thumb_urls);
          const isNight = tour.service_type === "night_tour";
          const TypeIcon = isNight ? Moon : Sun;
          const isActive = (tour.status ?? "active") !== "inactive";
          const adultRate = Number(tour.adult_rate || 0);
          const cover = thumbs[0] || images[0] || "";

          return (
            <article
              key={tour.service_id}
              className={`overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-colors duration-200 ${
                isActive
                  ? "border-[var(--color-border)] hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]"
                  : "border-[var(--color-border)] opacity-85"
              }`}
            >
              {cover ? (
                <div className="relative h-40 w-full bg-[var(--color-background)]">
                  <Image
                    src={cover}
                    alt={tour.service_name}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className={`flex h-40 w-full items-center justify-center bg-[var(--color-background)] ${
                    isNight ? "text-indigo-300" : "text-amber-300"
                  }`}
                >
                  <TypeIcon className="h-10 w-10" />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="line-clamp-1 text-base font-semibold text-[var(--color-text)]">{tour.service_name}</h3>
                      <span className={`shrink-0 text-xs font-semibold ${isActive ? "text-emerald-700" : "text-amber-700"}`}>
                        {isActive ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-[var(--color-muted)]">
                      <span>{tourTypeLabel(tour.service_type)}</span>
                      <span aria-hidden>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {tourSchedule(tour)}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-[var(--color-text)]">
                      {adultRate > 0 ? formatPhpPeso(adultRate) : "—"}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">/ adult</p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  {images.length} photo{images.length === 1 ? "" : "s"}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditor(tour)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    <Settings2 className="h-4 w-4" />
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleVisibility(tour)}
                    disabled={togglingId === tour.service_id}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
                  >
                    {isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {isActive ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={Boolean(editingId)}
        onClose={closeEditor}
        title={editingTour ? `${editingTour.service_name} details` : "Tour details"}
        size="md"
        footer={
          editingTour ? (
            <>
              <button
                type="button"
                onClick={closeEditor}
                disabled={editorBusy}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEditor()}
                disabled={editorBusy || uploadQueueCount > 0}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {editorBusy ? "Saving..." : "Save changes"}
              </button>
            </>
          ) : null
        }
      >
        {editingTour ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                Adult rate (₱)
                <input
                  type="text"
                  inputMode="decimal"
                  value={editAdult}
                  onChange={(e) => setEditAdult(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                Kid rate (₱)
                <input
                  type="text"
                  inputMode="decimal"
                  value={editKid}
                  onChange={(e) => setEditKid(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Photos</p>
              {editImages.length ? (
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {editImages.map((src, index) => (
                    <li
                      key={`${src}-${index}`}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
                    >
                      <Image
                        src={editThumbs[index] || src}
                        alt={`${editingTour.service_name} photo ${index + 1}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 200px"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index)}
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
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
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-4 text-sm text-[var(--color-muted)]">
                  <ImageOff className="h-4 w-4" />
                  No photos yet — guests see a stock image until you add one.
                </div>
              )}
            </div>

            {accessToken ? (
              <UnitPhotoUploader
                token={accessToken}
                unitId={editingTour.service_id}
                folder="tours"
                currentCount={editImages.length}
                onUploaded={handleUploadedMedia}
                onUploadFailed={(fileName, reason) =>
                  showToast({ type: "error", title: "Upload failed", message: `${fileName}: ${reason}` })
                }
                onQueueChange={setUploadQueueCount}
              />
            ) : null}

            <p className="text-xs text-[var(--color-muted)]">
              Photos and prices are saved when you choose <span className="font-semibold">Save changes</span>.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
