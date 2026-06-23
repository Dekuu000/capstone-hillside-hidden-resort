"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Sparkles, Wrench, AlertCircle, X, Star, Trash2, Eye, EyeOff } from "lucide-react";
import type { UnitItem, UnitListResponse } from "../../../packages/shared/src/types";
import {
  unitItemSchema,
  unitListResponseSchema,
  unitStatusUpdateResponseSchema,
  unitWriteResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { getUnitLabel } from "../../lib/unitLabel";
import { ImageLightbox } from "../shared/ImageLightbox";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { UnitPhotoUploader } from "../shared/UnitPhotoUploader";
import { useToast } from "../shared/ToastProvider";
import {
  deleteManagedUnitImageUrls,
  normalizeUnitImageUrls,
  normalizeUnitThumbUrls,
} from "../../lib/unitMedia";
import { AdminPageHeader } from "../layout/AdminPageHeader";
import { Modal } from "../shared/Modal";
import { Pagination } from "../shared/Pagination";
import { Select } from "../shared/Select";

type AdminUnitsClientProps = {
  initialToken?: string | null;
  initialData?: UnitListResponse | null;
  initialType?: string;
  initialSearch?: string;
  initialShowInactive?: boolean;
  initialPage?: number;
  initialOpenUnitId?: string | null;
  initialOperationalStatus?: UnitOperationalStatus | "";
  /** When embedded under the Stays & Tours tabs, the page owns the header. */
  hideHeader?: boolean;
};

const PAGE_SIZE = 12;

type UnitOperationalStatus = "cleaned" | "occupied" | "maintenance" | "dirty";

function formatOperationalStatus(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "occupied":
      return "Occupied";
    case "maintenance":
      return "Maintenance";
    case "dirty":
      return "Dirty";
    default:
      return "Cleaned";
  }
}

function operationalStatusTextClass(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "occupied":
      return "text-blue-700";
    case "maintenance":
      return "text-amber-700";
    case "dirty":
      return "text-rose-700";
    default:
      return "text-emerald-700";
  }
}

function normalizeUnitsError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Units API timed out. Check if hillside-api is running on port 8000.";
  }
  const resolved = getApiErrorMessage(error, "Failed to load units.");
  if (/aborted/i.test(resolved)) {
    return "Units API timed out. Check if hillside-api is running on port 8000.";
  }
  return resolved;
}

export function AdminUnitsClient({
  initialToken = null,
  initialData = null,
  initialType = "",
  initialSearch = "",
  initialShowInactive = false,
  initialPage = 1,
  initialOpenUnitId = null,
  initialOperationalStatus = "",
  hideHeader = false,
}: AdminUnitsClientProps) {
  const token = initialToken;
  const { showToast } = useToast();

  const [unitType, setUnitType] = useState(initialType);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [showInactive, setShowInactive] = useState(initialShowInactive);
  const [operationalStatus, setOperationalStatus] = useState<UnitOperationalStatus | "">(initialOperationalStatus);
  const [page, setPage] = useState(Math.max(1, initialPage));

  const [items, setItems] = useState<UnitItem[]>(initialData?.items ?? []);
  const [count, setCount] = useState(initialData?.count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState<Record<string, boolean>>({});
  const [unitDetailLoading, setUnitDetailLoading] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnitCode, setEditUnitCode] = useState("");
  const [editRoomNumber, setEditRoomNumber] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBasePrice, setEditBasePrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [editType, setEditType] = useState<"room" | "cottage" | "amenity">("room");
  const [editOperationalStatus, setEditOperationalStatus] = useState<UnitOperationalStatus>("cleaned");
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [editImageThumbUrls, setEditImageThumbUrls] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [mediaActionBusy, setMediaActionBusy] = useState(false);
  const [uploadQueueCount, setUploadQueueCount] = useState(0);
  const initialDataConsumedRef = useRef(false);

  const resetEditor = useCallback(() => {
    setEditingUnitId(null);
    setEditName("");
    setEditUnitCode("");
    setEditRoomNumber("");
    setEditDescription("");
    setEditBasePrice("");
    setEditCapacity("");
    setEditType("room");
    setEditOperationalStatus("cleaned");
    setEditImageUrls([]);
    setEditImageThumbUrls([]);
    setGalleryIndex(0);
    setLightboxOpen(false);
    setPendingRemoveIndex(null);
    setMediaActionBusy(false);
    setUploadQueueCount(0);
    setUnitDetailLoading(false);
    setEditorBusy(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchValue(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchUnits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (unitType) qs.set("unit_type", unitType);
      if (!showInactive) qs.set("is_active", "true");
      if (operationalStatus) qs.set("operational_status", operationalStatus);
      if (searchValue) qs.set("search", searchValue);

      const data = await apiFetch<UnitListResponse>(
        `/v2/units?${qs.toString()}`,
        { method: "GET", signal: controller.signal },
        token,
        unitListResponseSchema,
      );
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
    } catch (unknownError) {
      setItems([]);
      setCount(0);
      setError(normalizeUnitsError(unknownError));
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [operationalStatus, page, searchValue, showInactive, token, unitType]);

  const openEditor = useCallback(
    async (unitId: string) => {
      if (!token) return;
      setError(null);
      setNotice(null);
      setUnitDetailLoading(true);
      try {
        const unit = await apiFetch<UnitItem>(
          `/v2/units/${encodeURIComponent(unitId)}`,
          { method: "GET" },
          token,
          unitItemSchema,
        );
        setEditingUnitId(unit.unit_id);
        setEditName(unit.name || "");
        setEditUnitCode(unit.unit_code || "");
        setEditRoomNumber(unit.room_number || "");
        setEditDescription(unit.description || "");
        setEditBasePrice(String(unit.base_price ?? ""));
        setEditCapacity(String(unit.capacity ?? ""));
        setEditType((unit.type as "room" | "cottage" | "amenity") || "room");
        setEditOperationalStatus(
          ((unit.operational_status as UnitOperationalStatus | undefined) || "cleaned"),
        );
        const normalizedImages = normalizeUnitImageUrls(unit.image_urls, unit.image_url);
        setEditImageUrls(normalizedImages);
        setEditImageThumbUrls(normalizeUnitThumbUrls(normalizedImages, unit.image_thumb_urls ?? null));
        setGalleryIndex(0);
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Failed to load unit details."));
      } finally {
        setUnitDetailLoading(false);
      }
    },
    [token],
  );

  const handleUploadedMedia = useCallback((uploads: { mediumUrl: string; thumbUrl: string }[]) => {
    if (!uploads.length) return;
    setEditImageUrls((prev) => [...prev, ...uploads.map((item) => item.mediumUrl)]);
    setEditImageThumbUrls((prev) => [...prev, ...uploads.map((item) => item.thumbUrl)]);
    setNotice(`${uploads.length} photo${uploads.length === 1 ? "" : "s"} uploaded.`);
    setError(null);
  }, []);

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setEditImageUrls((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setEditImageThumbUrls((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setGalleryIndex(toIndex);
    setNotice("Photo order updated.");
    setError(null);
  }, []);

  const setCoverImage = useCallback((index: number) => {
    if (index <= 0) return;
    setEditImageUrls((prev) => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
    setEditImageThumbUrls((prev) => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
    setGalleryIndex(0);
  }, []);

  const requestRemoveImage = useCallback((index: number) => {
    if (index < 0 || index >= editImageUrls.length) return;
    setPendingRemoveIndex(index);
  }, [editImageUrls.length]);

  const confirmRemoveImage = useCallback(async () => {
    if (pendingRemoveIndex === null || !editingUnitId || !token) return;

    const index = pendingRemoveIndex;
    const currentImages = [...editImageUrls];
    const currentThumbs = [...editImageThumbUrls];
    if (index < 0 || index >= currentImages.length) {
      setPendingRemoveIndex(null);
      return;
    }

    const nextImages = currentImages.filter((_, itemIndex) => itemIndex !== index);
    const nextThumbs = currentThumbs.filter((_, itemIndex) => itemIndex !== index);
    const alignedThumbs = normalizeUnitThumbUrls(nextImages, nextThumbs);
    const toDelete = [currentImages[index], currentThumbs[index]].filter((value): value is string => Boolean(value));

    setPendingRemoveIndex(null);
    setMediaActionBusy(true);
    setError(null);

    try {
      await apiFetch(
        `/v2/units/${encodeURIComponent(editingUnitId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            image_url: nextImages[0] || null,
            image_urls: nextImages,
            image_thumb_urls: alignedThumbs,
          }),
        },
        token,
        unitWriteResponseSchema,
      );

      setEditImageUrls(nextImages);
      setEditImageThumbUrls(alignedThumbs);
      setGalleryIndex((prev) => Math.max(0, Math.min(prev, Math.max(nextImages.length - 1, 0))));

      if (toDelete.length) {
        try {
          await deleteManagedUnitImageUrls(token, toDelete);
        } catch {
          showToast({
            type: "warning",
            title: "Image removed",
            message: "Photo was removed from unit. Storage cleanup will retry later.",
          });
          return;
        }
      }

      showToast({
        type: "success",
        title: "Image removed",
        message: "Photo removed successfully.",
      });
    } catch (unknownError) {
      const message = getApiErrorMessage(unknownError, "Failed to remove image.");
      setError(message);
      showToast({
        type: "error",
        title: "Remove failed",
        message,
      });
    } finally {
      setMediaActionBusy(false);
    }
  }, [
    editImageThumbUrls,
    editImageUrls,
    editingUnitId,
    pendingRemoveIndex,
    showToast,
    token,
  ]);

  const saveEditor = useCallback(async () => {
    if (!token || !editingUnitId) return;

    const parsedBasePrice = Number(editBasePrice);
    const parsedCapacity = Number(editCapacity);
    if (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0) {
      setError("Base price must be a valid non-negative number.");
      return;
    }
    if (!Number.isFinite(parsedCapacity) || parsedCapacity < 1) {
      setError("Capacity must be at least 1.");
      return;
    }
    if (!editName.trim()) {
      setError("Unit name is required.");
      return;
    }
    if (!editUnitCode.trim()) {
      setError("Unit code is required.");
      return;
    }

    setEditorBusy(true);
    setError(null);
    try {
      const uniqueImageUrls = editImageUrls.filter(Boolean);
      const alignedThumbs = normalizeUnitThumbUrls(uniqueImageUrls, editImageThumbUrls);
      await apiFetch(
        `/v2/units/${encodeURIComponent(editingUnitId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editName.trim(),
            unit_code: editUnitCode.trim(),
            room_number: editRoomNumber.trim() || null,
            type: editType,
            description: editDescription.trim() || null,
            base_price: parsedBasePrice,
            capacity: parsedCapacity,
            operational_status: editOperationalStatus,
            image_url: uniqueImageUrls[0] || null,
            image_urls: uniqueImageUrls,
            image_thumb_urls: alignedThumbs,
          }),
        },
        token,
        unitWriteResponseSchema,
      );
      showToast({
        type: "success",
        title: "Changes saved",
        message: "Unit details updated successfully.",
      });
      setNotice("Unit details updated.");
      await fetchUnits();
      resetEditor();
    } catch (unknownError) {
      setError(getApiErrorMessage(unknownError, "Failed to update unit."));
    } finally {
      setEditorBusy(false);
    }
  }, [editBasePrice, editCapacity, editDescription, editImageThumbUrls, editImageUrls, editName, editOperationalStatus, editRoomNumber, editType, editUnitCode, editingUnitId, fetchUnits, resetEditor, showToast, token]);

  useEffect(() => {
    if (!token) return;
    const initialMatches =
      initialData &&
      page === Math.max(1, initialPage) &&
      unitType === initialType &&
      operationalStatus === initialOperationalStatus &&
      searchValue === initialSearch &&
      showInactive === initialShowInactive;
    if (!initialDataConsumedRef.current && initialMatches) {
      initialDataConsumedRef.current = true;
      return;
    }
    initialDataConsumedRef.current = true;
    void fetchUnits();
  }, [fetchUnits, initialData, initialOperationalStatus, initialPage, initialSearch, initialShowInactive, initialType, operationalStatus, page, searchValue, showInactive, token, unitType]);

  useEffect(() => {
    if (!token || !initialOpenUnitId) return;
    if (editingUnitId) return;
    void openEditor(initialOpenUnitId);
  }, [editingUnitId, initialOpenUnitId, openEditor, token]);

  const toggleStatus = useCallback(
    async (unit: UnitItem) => {
      if (!token) return;
      setToggleBusy((prev) => ({ ...prev, [unit.unit_id]: true }));
      setError(null);
      setNotice(null);
      try {
        await apiFetch(
          `/v2/units/${encodeURIComponent(unit.unit_id)}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_active: !unit.is_active }),
          },
          token,
          unitStatusUpdateResponseSchema,
        );
        setNotice(`${unit.name} is now ${unit.is_active ? "inactive" : "active"}.`);
        await fetchUnits();
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Failed to update unit status."));
      } finally {
        setToggleBusy((prev) => ({ ...prev, [unit.unit_id]: false }));
      }
    },
    [fetchUnits, token],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count]);
  const hasActiveFilters = Boolean(unitType || operationalStatus || searchInput || showInactive);
  const galleryImages = useMemo(() => editImageUrls.filter(Boolean), [editImageUrls]);
  const galleryThumbs = useMemo(
    () => normalizeUnitThumbUrls(galleryImages, editImageThumbUrls),
    [editImageThumbUrls, galleryImages],
  );
  const activeMediaIndex = Math.max(0, Math.min(galleryIndex, Math.max(galleryImages.length - 1, 0)));

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-[1600px] space-y-5">
        {hideHeader ? null : (
          <AdminPageHeader
            eyebrow="Inventory"
            title="Units"
            subtitle="Manage rooms, cottages, and amenities."
          />
        )}
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      {hideHeader ? null : (
        <AdminPageHeader
          eyebrow="Inventory"
          title="Units"
          subtitle="Manage rooms, cottages, and amenities with operational status."
          action={
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-xs text-[var(--color-muted)]">
              <p className="font-semibold text-[var(--color-text)]">Total</p>
              <p className="mt-1">{count} unit records</p>
            </div>
          }
        />
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="mt-2 text-xl font-bold text-[var(--color-text)]">
            {items.filter((u) => (u.operational_status || "cleaned") === "cleaned").length}
          </p>
          <p className="text-xs text-[var(--color-muted)]">Cleaned</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-50 text-[var(--color-primary)]">
            <BedDouble className="h-4 w-4" />
          </span>
          <p className="mt-2 text-xl font-bold text-[var(--color-text)]">
            {items.filter((u) => (u.operational_status || "cleaned") === "occupied").length}
          </p>
          <p className="text-xs text-[var(--color-muted)]">Occupied</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-[var(--color-cta)]">
            <Wrench className="h-4 w-4" />
          </span>
          <p className="mt-2 text-xl font-bold text-[var(--color-text)]">
            {items.filter((u) => (u.operational_status || "cleaned") === "maintenance").length}
          </p>
          <p className="text-xs text-[var(--color-muted)]">Maintenance</p>
        </div>
      </div>

      <div className="sticky top-[72px] z-20 mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm lg:top-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[160px_180px_1fr_auto_auto]">
          <Select
            ariaLabel="Filter by unit type"
            value={unitType}
            onChange={(next) => {
              setUnitType(next);
              setPage(1);
            }}
            options={[
              { value: "", label: "All types" },
              { value: "room", label: "Room" },
              { value: "cottage", label: "Cottage" },
              { value: "amenity", label: "Amenity" },
            ]}
          />

          <Select
            ariaLabel="Filter by room status"
            value={operationalStatus}
            onChange={(next) => {
              setOperationalStatus(next as UnitOperationalStatus | "");
              setPage(1);
            }}
            options={[
              { value: "", label: "All statuses" },
              { value: "cleaned", label: "Cleaned" },
              { value: "occupied", label: "Occupied" },
              { value: "maintenance", label: "Maintenance" },
              { value: "dirty", label: "Dirty" },
            ]}
          />

          <label className="grid">
            <span className="sr-only">Search unit</span>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search unit name or description"
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)]"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setShowInactive((prev) => !prev);
              setPage(1);
            }}
            aria-pressed={showInactive}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
              showInactive
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]"
            }`}
          >
            {showInactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showInactive ? "Showing inactive" : "Include inactive"}
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setUnitType("");
                setOperationalStatus("");
                setSearchInput("");
                setShowInactive(false);
                setPage(1);
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-xs font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
            >
              Reset
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>

      {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]" />
          ))}
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-muted)] shadow-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <AlertCircle className="h-4 w-4 text-[var(--color-cta)]" />
            No units found for current filters
          </p>
          <p className="mt-2">Try resetting filters or enabling inactive units.</p>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((unit) => {
            const label = getUnitLabel(unit.name);
            const cover =
              (unit.image_thumb_urls && unit.image_thumb_urls.length
                ? unit.image_thumb_urls[0]
                : unit.image_urls && unit.image_urls.length
                  ? unit.image_urls[0]
                  : unit.image_url) || "";
            return (
              <article
                key={unit.unit_id}
                className={`overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-colors duration-200 ${
                  unit.is_active ? "border-[var(--color-border)] hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]" : "border-[var(--color-border)] opacity-85"
                }`}
              >
                {cover ? (
                  <Image
                    src={cover}
                    alt={label.title}
                    width={640}
                    height={256}
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="h-36 bg-[var(--color-background)]" />
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="line-clamp-1 text-base font-semibold text-[var(--color-text)]">{label.title}</h3>
                      {label.subtitle ? (
                        <p className="mt-0.5 text-xs font-medium text-[var(--color-muted)]">{label.subtitle}</p>
                      ) : null}
                    </div>
                    <p className="text-sm font-bold text-[var(--color-text)]">{formatPeso(unit.base_price)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium">
                    <span className="capitalize text-[var(--color-muted)]">{unit.type}</span>
                    <span aria-hidden className="text-[var(--color-border)]">•</span>
                    <span className={operationalStatusTextClass(unit.operational_status)}>
                      {formatOperationalStatus(unit.operational_status)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm text-[var(--color-muted)]">{unit.description || "No description."}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-muted)]">
                    <span>Capacity: {unit.capacity}</span>
                    <span className={unit.is_active ? "text-emerald-700" : "text-red-700"}>{unit.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openEditor(unit.unit_id)}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      Manage
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(unit)}
                      disabled={Boolean(toggleBusy[unit.unit_id])}
                      className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                        unit.is_active
                          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {toggleBusy[unit.unit_id] ? "Updating..." : unit.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <Pagination
        className="mt-4"
        page={page}
        totalPages={totalPages}
        totalCount={count}
        pageSize={PAGE_SIZE}
        onPageChange={(target) => setPage(Math.min(totalPages, Math.max(1, target)))}
      />

      <Modal
        open={Boolean(editingUnitId || unitDetailLoading)}
        onClose={resetEditor}
        title="Unit details"
        size="md"
        footer={
          editingUnitId && !unitDetailLoading ? (
            <>
              <button
                type="button"
                onClick={resetEditor}
                disabled={editorBusy}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEditor()}
                disabled={editorBusy || mediaActionBusy || uploadQueueCount > 0}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {editorBusy ? "Saving..." : "Save changes"}
              </button>
            </>
          ) : null
        }
      >
        {unitDetailLoading ? <p className="text-sm text-[var(--color-muted)]">Loading unit details...</p> : null}

        {editingUnitId && !unitDetailLoading ? (
              <div className="space-y-4">
                <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                  Name
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Unit code
                    <input
                      type="text"
                      value={editUnitCode}
                      onChange={(event) => setEditUnitCode(event.target.value)}
                      className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Room number (optional)
                    <input
                      type="text"
                      value={editRoomNumber}
                      onChange={(event) => setEditRoomNumber(event.target.value)}
                      placeholder="e.g. 203"
                      className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Type
                    <Select
                      ariaLabel="Unit type"
                      value={editType}
                      onChange={(next) => setEditType(next as "room" | "cottage" | "amenity")}
                      options={[
                        { value: "room", label: "Room" },
                        { value: "cottage", label: "Cottage" },
                        { value: "amenity", label: "Amenity" },
                      ]}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Room status
                    <Select
                      ariaLabel="Room status"
                      value={editOperationalStatus}
                      onChange={(next) => setEditOperationalStatus(next as UnitOperationalStatus)}
                      options={[
                        { value: "cleaned", label: "Cleaned" },
                        { value: "occupied", label: "Occupied" },
                        { value: "maintenance", label: "Maintenance" },
                        { value: "dirty", label: "Dirty" },
                      ]}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Capacity
                    <input
                      type="number"
                      min={1}
                      value={editCapacity}
                      onChange={(event) => setEditCapacity(event.target.value)}
                      className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                    Base price
                    <input
                      type="number"
                      min={0}
                      value={editBasePrice}
                      onChange={(event) => setEditBasePrice(event.target.value)}
                      className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                  Description
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="min-h-28 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                  />
                </label>
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">Photos</h4>
                  <UnitImageGallery
                    images={galleryImages}
                    thumbs={galleryThumbs}
                    altBase={editName || "Unit"}
                    selectedIndex={activeMediaIndex}
                    onSelect={setGalleryIndex}
                    onReorder={reorderImages}
                    onOpenLightbox={(index) => {
                      setGalleryIndex(index);
                      setLightboxOpen(true);
                    }}
                  />
                  {galleryImages.length > 1 ? (
                    <p className="text-xs text-[var(--color-muted)]">Drag thumbnails to reorder photos.</p>
                  ) : null}
                  {galleryImages.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setCoverImage(activeMediaIndex)}
                        disabled={activeMediaIndex === 0 || mediaActionBusy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
                      >
                        <Star className="h-4 w-4" />
                        Set as cover
                      </button>
                      <button
                        type="button"
                        onClick={() => requestRemoveImage(activeMediaIndex)}
                        disabled={mediaActionBusy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  ) : null}
                  {editingUnitId ? (
                    <UnitPhotoUploader
                      token={token}
                      unitId={editingUnitId}
                      currentCount={galleryImages.length}
                      onUploaded={handleUploadedMedia}
                      onUploadFailed={(fileName, reason) => {
                        showToast({
                          type: "error",
                          title: "Upload failed",
                          message: `${fileName}: ${reason}`,
                        });
                      }}
                      onQueueChange={setUploadQueueCount}
                    />
                  ) : null}
                </section>
                {uploadQueueCount > 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">
                    Wait for {uploadQueueCount} upload{uploadQueueCount === 1 ? "" : "s"} before saving.
                  </p>
                ) : null}
              </div>
        ) : null}
      </Modal>

      {pendingRemoveIndex !== null ? (
        <Modal
          open
          onClose={() => setPendingRemoveIndex(null)}
          title="Remove this image?"
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setPendingRemoveIndex(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveImage}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Remove
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-muted)]">This will remove the image from this unit after you save changes.</p>
        </Modal>
      ) : null}
      <ImageLightbox
        open={lightboxOpen}
        images={galleryImages}
        altBase={editName || "Unit"}
        initialIndex={activeMediaIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </section>
  );
}


