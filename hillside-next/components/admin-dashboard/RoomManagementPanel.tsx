"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Settings2 } from "lucide-react";
import { unitListResponseSchema, unitWriteResponseSchema } from "../../../packages/shared/src/schemas";
import type { UnitItem } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { useToast } from "../shared/ToastProvider";

type UnitOperationalStatus = "cleaned" | "occupied" | "dirty" | "maintenance";

const OPERATIONAL_STATUS_OPTIONS: Array<{ value: UnitOperationalStatus; label: string }> = [
  { value: "cleaned", label: "Cleaned" },
  { value: "occupied", label: "Occupied" },
  { value: "dirty", label: "Dirty" },
  { value: "maintenance", label: "Maintenance" },
];

function normalizeAmenities(input: string[]) {
  const unique = new Set<string>();
  for (const item of input) {
    const normalized = item.trim();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function unitLabel(unit: UnitItem) {
  const room = unit.room_number ? ` • ${unit.room_number}` : "";
  return `${unit.unit_code} • ${unit.name}${room}`;
}

export function RoomManagementPanel({
  initialToken,
  initialUnits,
}: {
  initialToken?: string | null;
  initialUnits?: UnitItem[];
}) {
  const { showToast } = useToast();
  const token = initialToken ?? null;

  const [units, setUnits] = useState<UnitItem[]>(initialUnits ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnits?.[0]?.unit_id ?? "");

  const [basePrice, setBasePrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [operationalStatus, setOperationalStatus] = useState<UnitOperationalStatus>("cleaned");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityInput, setAmenityInput] = useState("");

  const loadUnits = useCallback(
    async (preserveSelection = true) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(
          "/v2/units?limit=200&offset=0",
          { method: "GET" },
          token,
          unitListResponseSchema,
        );
        const nextItems = response.items ?? [];
        setUnits(nextItems);
        if (nextItems.length === 0) {
          setSelectedUnitId("");
          return;
        }
        if (!preserveSelection) {
          setSelectedUnitId(nextItems[0].unit_id);
          return;
        }
        const stillExists = nextItems.some((item) => item.unit_id === selectedUnitId);
        if (!stillExists) {
          setSelectedUnitId(nextItems[0].unit_id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load units.");
      } finally {
        setLoading(false);
      }
    },
    [selectedUnitId, token],
  );

  useEffect(() => {
    if ((initialUnits ?? []).length === 0) {
      void loadUnits(false);
    }
  }, [initialUnits, loadUnits]);

  const filteredUnits = useMemo(() => {
    if (!search.trim()) return units;
    const query = search.trim().toLowerCase();
    return units.filter((unit) => {
      const haystack = `${unit.name} ${unit.unit_code} ${unit.room_number || ""} ${unit.type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, units]);

  const selectedUnit = useMemo(
    () => units.find((item) => item.unit_id === selectedUnitId) ?? null,
    [selectedUnitId, units],
  );

  useEffect(() => {
    if (filteredUnits.length === 0) return;
    if (filteredUnits.some((item) => item.unit_id === selectedUnitId)) return;
    setSelectedUnitId(filteredUnits[0].unit_id);
  }, [filteredUnits, selectedUnitId]);

  useEffect(() => {
    if (!selectedUnit) return;
    setBasePrice(String(selectedUnit.base_price ?? ""));
    setIsActive(Boolean(selectedUnit.is_active));
    setOperationalStatus(((selectedUnit.operational_status as UnitOperationalStatus | undefined) ?? "cleaned"));
    setAmenities(normalizeAmenities(selectedUnit.amenities ?? []));
    setAmenityInput("");
  }, [selectedUnit]);

  const addAmenity = useCallback(() => {
    const raw = amenityInput.trim();
    if (!raw) return;
    setAmenities((prev) => normalizeAmenities([...prev, raw]));
    setAmenityInput("");
  }, [amenityInput]);

  const saveUnit = useCallback(async () => {
    if (!token || !selectedUnit) return;
    const parsedBasePrice = Number(basePrice);
    if (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0) {
      setError("Base price must be a valid non-negative number.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/v2/units/${encodeURIComponent(selectedUnit.unit_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            base_price: parsedBasePrice,
            is_active: isActive,
            operational_status: operationalStatus,
            amenities,
          }),
        },
        token,
        unitWriteResponseSchema,
      );

      setUnits((prev) =>
        prev.map((item) => (item.unit_id === response.unit.unit_id ? response.unit : item)),
      );
      showToast({
        type: "success",
        title: "Room management saved",
        message: `${response.unit.unit_code} updated.`,
      });
      void loadUnits(true);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save unit.";
      setError(message);
      showToast({ type: "error", title: "Save failed", message });
    } finally {
      setSaving(false);
    }
  }, [amenities, basePrice, isActive, loadUnits, operationalStatus, selectedUnit, showToast, token]);

  if (!token) {
    return (
      <section className="surface p-4 sm:p-5">
        <p className="text-sm font-semibold text-[var(--color-text)]">No admin session found.</p>
      </section>
    );
  }

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Room Management</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">Update amenities, base pricing, and status</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Use quick edits here, or open full Units page for inventory administration.</p>
        </div>
        <Link
          href="/admin/units"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          Open full Units page
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Search unit</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code, name, room, type"
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Unit</span>
            <select
              value={selectedUnitId}
              onChange={(event) => setSelectedUnitId(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            >
              {filteredUnits.length === 0 ? <option value="">No units found</option> : null}
              {filteredUnits.map((unit) => (
                <option key={unit.unit_id} value={unit.unit_id}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
          </label>

          {loading ? <p className="text-xs text-[var(--color-muted)]">Loading units...</p> : null}

          {selectedUnit ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <p className="text-xs text-[var(--color-muted)]">Selected</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                {selectedUnit.name} ({selectedUnit.type})
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {selectedUnit.unit_code}
                {selectedUnit.room_number ? ` • Room ${selectedUnit.room_number}` : ""}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Price override (base rate)</span>
            <input
              type="number"
              min={0}
              value={basePrice}
              onChange={(event) => setBasePrice(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Availability</span>
              <select
                value={isActive ? "active" : "inactive"}
                onChange={(event) => setIsActive(event.target.value === "active")}
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Operational status</span>
              <select
                value={operationalStatus}
                onChange={(event) => setOperationalStatus(event.target.value as UnitOperationalStatus)}
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
              >
                {OPERATIONAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Amenities</p>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2">
              {amenities.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAmenities((prev) => prev.filter((entry) => entry !== item))}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-medium text-[var(--color-text)]"
                >
                  {item} ×
                </button>
              ))}
              <input
                value={amenityInput}
                onChange={(event) => setAmenityInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addAmenity();
                  }
                }}
                placeholder="Type amenity + Enter"
                className="h-8 min-w-[180px] flex-1 border-0 bg-transparent text-sm text-[var(--color-text)] outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void saveUnit()}
          disabled={saving || !selectedUnit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          {saving ? "Saving..." : "Save room updates"}
        </button>
        <button
          type="button"
          onClick={() => void loadUnits(true)}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
        >
          <Settings2 className="h-4 w-4" />
          Refresh units
        </button>
      </div>
    </section>
  );
}
