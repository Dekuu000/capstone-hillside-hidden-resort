"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UnitItem, UnitListResponse } from "../../../packages/shared/src/types";
import {
  unitItemSchema,
  unitListResponseSchema,
  unitStatusUpdateResponseSchema,
  unitWriteResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";

type AdminUnitsClientProps = {
  initialToken?: string | null;
  initialData?: UnitListResponse | null;
  initialType?: string;
  initialSearch?: string;
  initialShowInactive?: boolean;
  initialPage?: number;
  initialOpenUnitId?: string | null;
};

const PAGE_SIZE = 12;

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function AdminUnitsClient({
  initialToken = null,
  initialData = null,
  initialType = "",
  initialSearch = "",
  initialShowInactive = false,
  initialPage = 1,
  initialOpenUnitId = null,
}: AdminUnitsClientProps) {
  const token = initialToken;

  const [unitType, setUnitType] = useState(initialType);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [showInactive, setShowInactive] = useState(initialShowInactive);
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
  const [editDescription, setEditDescription] = useState("");
  const [editBasePrice, setEditBasePrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [editType, setEditType] = useState<"room" | "cottage" | "amenity">("room");

  const resetEditor = useCallback(() => {
    setEditingUnitId(null);
    setEditName("");
    setEditDescription("");
    setEditBasePrice("");
    setEditCapacity("");
    setEditType("room");
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
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (unitType) qs.set("unit_type", unitType);
      if (!showInactive) qs.set("is_active", "true");
      if (searchValue) qs.set("search", searchValue);

      const data = await apiFetch<UnitListResponse>(
        `/v2/units?${qs.toString()}`,
        { method: "GET" },
        token,
        unitListResponseSchema,
      );
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
    } catch (unknownError) {
      setItems([]);
      setCount(0);
      setError(unknownError instanceof Error ? unknownError.message : "Failed to load units.");
    } finally {
      setLoading(false);
    }
  }, [page, searchValue, showInactive, token, unitType]);

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
        setEditDescription(unit.description || "");
        setEditBasePrice(String(unit.base_price ?? ""));
        setEditCapacity(String(unit.capacity ?? ""));
        setEditType((unit.type as "room" | "cottage" | "amenity") || "room");
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "Failed to load unit details.");
      } finally {
        setUnitDetailLoading(false);
      }
    },
    [token],
  );

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

    setEditorBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/v2/units/${encodeURIComponent(editingUnitId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editName.trim(),
            type: editType,
            description: editDescription.trim() || null,
            base_price: parsedBasePrice,
            capacity: parsedCapacity,
          }),
        },
        token,
        unitWriteResponseSchema,
      );
      setNotice("Unit details updated.");
      await fetchUnits();
      resetEditor();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to update unit.");
    } finally {
      setEditorBusy(false);
    }
  }, [editBasePrice, editCapacity, editDescription, editName, editType, editingUnitId, fetchUnits, resetEditor, token]);

  useEffect(() => {
    if (!token) return;
    const initialMatches =
      initialData &&
      page === Math.max(1, initialPage) &&
      unitType === initialType &&
      searchValue === initialSearch &&
      showInactive === initialShowInactive;
    if (initialMatches) return;
    void fetchUnits();
  }, [fetchUnits, initialData, initialPage, initialSearch, initialShowInactive, initialType, page, searchValue, showInactive, token, unitType]);

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

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Units</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Units</h1>
        <p className="mt-1 text-sm text-slate-600">Manage rooms, cottages, and amenities through V2 API.</p>
      </header>

      <div className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-600">
            Type
            <select
              value={unitType}
              onChange={(event) => {
                setUnitType(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="room">Room</option>
              <option value="cottage">Cottage</option>
              <option value="amenity">Amenity</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-600 md:col-span-2">
            Search
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search unit name or description"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => {
                setShowInactive(event.target.checked);
                setPage(1);
              }}
            />
            Show inactive
          </label>
        </div>
      </div>

      {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mb-3 text-sm text-slate-600">Loading units...</p> : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-6 text-sm text-slate-600 shadow-sm">No units found for current filters.</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((unit) => {
            const cover = (unit.image_urls && unit.image_urls.length ? unit.image_urls[0] : unit.image_url) || "";
            return (
              <article key={unit.unit_id} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${unit.is_active ? "border-blue-100" : "border-slate-200 opacity-70"}`}>
                {cover ? (
                  <Image
                    src={cover}
                    alt={unit.name}
                    width={640}
                    height={256}
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="h-40 bg-slate-100" />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{unit.name}</h3>
                      <p className="text-xs capitalize text-slate-500">{unit.type}</p>
                    </div>
                    <p className="text-sm font-bold text-blue-900">{formatPeso(unit.base_price)}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{unit.description || "No description."}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Capacity: {unit.capacity}</span>
                    <span className={unit.is_active ? "text-emerald-700" : "text-red-700"}>{unit.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      onClick={() => void openEditor(unit.unit_id)}
                      className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
                    >
                      View / Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(unit)}
                      disabled={Boolean(toggleBusy[unit.unit_id])}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {toggleBusy[unit.unit_id] ? "Updating..." : unit.is_active ? "Set Inactive" : "Set Active"}
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
          Page {page} of {totalPages} | {count} total
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="w-full rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Unit details</h3>
              <button
                type="button"
                onClick={resetEditor}
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
                aria-label="Close"
              >
                x
              </button>
            </div>

            {unitDetailLoading ? <p className="text-sm text-slate-600">Loading unit details...</p> : null}

            {editingUnitId && !unitDetailLoading ? (
              <div className="space-y-3">
                <label className="grid gap-1 text-xs text-slate-600">
                  Name
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-600">
                    Type
                    <select
                      value={editType}
                      onChange={(event) => setEditType(event.target.value as "room" | "cottage" | "amenity")}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="room">Room</option>
                      <option value="cottage">Cottage</option>
                      <option value="amenity">Amenity</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Capacity
                    <input
                      type="number"
                      min={1}
                      value={editCapacity}
                      onChange={(event) => setEditCapacity(event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs text-slate-600">
                  Base price
                  <input
                    type="number"
                    min={0}
                    value={editBasePrice}
                    onChange={(event) => setEditBasePrice(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Description
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    disabled={editorBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveEditor()}
                    className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={editorBusy}
                  >
                    {editorBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
