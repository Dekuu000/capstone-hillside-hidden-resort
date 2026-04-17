"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Sparkles, Wrench, AlertCircle, X, Star, Trash2 } from "lucide-react";
import type { UnitItem, UnitListResponse } from "../../../packages/shared/src/types";
import {
  unitItemSchema,
  unitListResponseSchema,
  unitStatusUpdateResponseSchema,
  unitWriteResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { ImageLightbox } from "../shared/ImageLightbox";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { UnitPhotoUploader } from "../shared/UnitPhotoUploader";
import { useToast } from "../shared/ToastProvider";
import {
  deleteManagedUnitImageUrls,
  normalizeUnitImageUrls,
  normalizeUnitThumbUrls,
} from "../../lib/unitMedia";

type AdminUnitsClientProps = {
  initialToken?: string | null;
  initialData?: UnitListResponse | null;
  initialType?: string;
  initialSearch?: string;
  initialShowInactive?: boolean;
  initialPage?: number;
  initialOpenUnitId?: string | null;
  initialOperationalStatus?: UnitOperationalStatus | "";
};

const PAGE_SIZE = 12;

type UnitOperationalStatus = "cleaned" | "occupied" | "maintenance" | "dirty";

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatOperationalStatus(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "cleaned":
      return "Cleaned";
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

function normalizeUnitsError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Units API timed out. Check if hillside-api is running on port 8000.";
  }
  if (error instanceof Error) {
    const message = error.message || "";
    if (/aborted/i.test(message)) {
      return "Units API timed out. Check if hillside-api is running on port 8000.";
    }
    return message;
  }
  return "Failed to load units.";
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
        setError(unknownError instanceof Error ? unknownError.message : "Failed to load unit details.");
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
      const message = unknownError instanceof Error ? unknownError.message : "Failed to remove image.";
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
      setError(unknownError instanceof Error ? unknownError.message : "Failed to update unit.");
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
        setError(unknownError instanceof Error ? unknownError.message : "Failed to update unit status.");
      } finally {
        setToggleBusy((prev) => ({ ...prev, [unit.unit_id]: false }));
      }
    },
    [fetchUnits, token],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count]);
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const galleryImages = useMemo(() => editImageUrls.filter(Boolean), [editImageUrls]);
  const galleryThumbs = useMemo(
    () => normalizeUnitThumbUrls(galleryImages, editImageThumbUrls),
    [editImageThumbUrls, galleryImages],
  );
  const activeMediaIndex = Math.max(0, Math.min(galleryIndex, Math.max(galleryImages.length - 1, 0)));

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Units</h1>
          <p className="mt-2 text-sm text-slate-600">Manage rooms, cottages, and amenities.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted)]">Inventory</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--color-text)]">Units</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Manage rooms, cottages, and amenities with operational status.</p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-xs text-[var(--color-muted)]">
            <p className="font-semibold text-[var(--color-text)]">Total</p>
            <p className="mt-1">{count} unit records</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <Sparkles className="h-4 w-4 text-[var(--color-secondary)]" />
              Cleaned
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">
              {items.filter((u) => (u.operational_status || "cleaned") === "cleaned").length}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <BedDouble className="h-4 w-4 text-[var(--color-primary)]" />
              Occupied
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">
              {items.filter((u) => (u.operational_status || "cleaned") === "occupied").length}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <Wrench className="h-4 w-4 text-[var(--color-cta)]" />
              Maintenance
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">
              {items.filter((u) => (u.operational_status || "cleaned") === "maintenance").length}
            </p>
          </div>
        </div>
      </header>

      <div className="sticky top-[72px] z-20 mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm lg:top-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_180px_1fr_auto_auto]">
          <label className="grid">
            <span className="sr-only">Filter by unit type</span>
            <select
              value={unitType}
              onChange={(event) => {
                setUnitType(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
            >
              <option value="">All types</option>
              <option value="room">Room</option>
              <option value="cottage">Cottage</option>
              <option value="amenity">Amenity</option>
            </select>
          </label>

          <label className="grid">
            <span className="sr-only">Filter by room status</span>
            <select
              value={operationalStatus}
              onChange={(event) => {
                setOperationalStatus(event.target.value as UnitOperationalStatus | "");
                setPage(1);
              }}
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
            >
              <option value="">All statuses</option>
              <option value="cleaned">Cleaned</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="dirty">Dirty</option>
            </select>
          </label>

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

          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => {
                setShowInactive(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            Inactive
          </label>

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
        </div>
      </div>

      {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
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
            const cover =
              (unit.image_thumb_urls && unit.image_thumb_urls.length
                ? unit.image_thumb_urls[0]
                : unit.image_urls && unit.image_urls.length
                  ? unit.image_urls[0]
                  : unit.image_url) || "";
            return (
              <article
                key={unit.unit_id}
                className={`overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-sm transition ${
                  unit.is_active ? "border-[var(--color-border)] hover:shadow-md" : "border-[var(--color-border)] opacity-80"
                }`}
              >
                {cover ? (
                  <Image
                    src={cover}
                    alt={unit.name}
                    width={640}
                    height={256}
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="h-36 bg-slate-100" />
                )}
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--color-text)]">{unit.name}</h3>
                    </div>
                    <p className="text-sm font-bold text-[var(--color-text)]">{formatPeso(unit.base_price)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--color-muted)]">
                      {unit.type}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        unit.operational_status === "occupied"
                          ? "bg-blue-100 text-blue-800"
                          : unit.operational_status === "maintenance"
                            ? "bg-amber-100 text-amber-800"
                            : unit.operational_status === "dirty"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {formatOperationalStatus(unit.operational_status)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">{unit.description || "No description."}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-muted)]">
                    <span>Capacity: {unit.capacity}</span>
                    <span className={unit.is_active ? "text-emerald-700" : "text-red-700"}>{unit.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void openEditor(unit.unit_id)}
                      className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-semibold text-[var(--color-text)]"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(unit)}
                      disabled={Boolean(toggleBusy[unit.unit_id])}
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
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

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Page {page} of {totalPages} • {count} total
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={!canPrev}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!canNext}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {(editingUnitId || unitDetailLoading) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:max-w-2xl md:rounded-2xl md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[var(--color-text)]">Unit details</h3>
              <button
                type="button"
                onClick={resetEditor}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {unitDetailLoading ? <p className="text-sm text-slate-600">Loading unit details...</p> : null}

            {editingUnitId && !unitDetailLoading ? (
              <div className="space-y-4">
                <label className="grid gap-1 text-xs text-slate-600">
                  Name
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-600">
                    Unit code
                    <input
                      type="text"
                      value={editUnitCode}
                      onChange={(event) => setEditUnitCode(event.target.value)}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Room number (optional)
                    <input
                      type="text"
                      value={editRoomNumber}
                      onChange={(event) => setEditRoomNumber(event.target.value)}
                      placeholder="e.g. 203"
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-600">
                    Type
                    <select
                      value={editType}
                      onChange={(event) => setEditType(event.target.value as "room" | "cottage" | "amenity")}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <option value="room">Room</option>
                      <option value="cottage">Cottage</option>
                      <option value="amenity">Amenity</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Room status
                    <select
                      value={editOperationalStatus}
                      onChange={(event) => setEditOperationalStatus(event.target.value as UnitOperationalStatus)}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <option value="cleaned">Cleaned</option>
                      <option value="occupied">Occupied</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="dirty">Dirty</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Capacity
                    <input
                      type="number"
                      min={1}
                      value={editCapacity}
                      onChange={(event) => setEditCapacity(event.target.value)}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Base price
                    <input
                      type="number"
                      min={0}
                      value={editBasePrice}
                      onChange={(event) => setEditBasePrice(event.target.value)}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs text-slate-600">
                  Description
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="min-h-24 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
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
                <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    disabled={editorBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveEditor()}
                    className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
                    disabled={editorBusy || mediaActionBusy || uploadQueueCount > 0}
                  >
                    {editorBusy ? "Saving..." : "Save changes"}
                  </button>
                </div>
                {uploadQueueCount > 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">
                    Wait for {uploadQueueCount} upload{uploadQueueCount === 1 ? "" : "s"} before saving.
                  </p>
                ) : null}

                {pendingRemoveIndex !== null ? (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg">
                      <p className="text-sm font-semibold text-[var(--color-text)]">Remove this image?</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        This will remove the image from this unit after you save changes.
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingRemoveIndex(null)}
                          className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmRemoveImage}
                          className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
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

