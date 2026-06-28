"use client";

import { useMemo, useState } from "react";
import { BedDouble, Check, Loader2 } from "lucide-react";
import type { OperationsRoomItem, UnitOperationalStatus } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";

const STATUS_META: Record<UnitOperationalStatus, { label: string; tone: string }> = {
  cleaned: { label: "Cleaned", tone: "text-emerald-600" },
  occupied: { label: "Occupied", tone: "text-[var(--color-primary)]" },
  dirty: { label: "Dirty", tone: "text-amber-600" },
  maintenance: { label: "Maintenance", tone: "text-red-600" },
};
const TILE_ORDER: UnitOperationalStatus[] = ["cleaned", "occupied", "dirty", "maintenance"];

function roomLabel(room: OperationsRoomItem): string {
  return room.room_number || room.name || "Unit";
}

/**
 * Front Desk housekeeping board: the room-status counts plus a one-tap
 * "Mark cleaned" for each dirty room. Checkout auto-flips a unit to "dirty";
 * staff flip it back to "cleaned" here once it's turned over.
 */
export function RoomStatusBoard({
  board: initialBoard,
  token,
}: {
  board: OperationsRoomItem[];
  token: string | null;
}) {
  const [board, setBoard] = useState<OperationsRoomItem[]>(initialBoard);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<UnitOperationalStatus, number> = { cleaned: 0, occupied: 0, dirty: 0, maintenance: 0 };
    for (const room of board) c[room.operational_status] += 1;
    return c;
  }, [board]);
  const dirtyRooms = useMemo(() => board.filter((room) => room.operational_status === "dirty"), [board]);

  const markCleaned = async (room: OperationsRoomItem) => {
    if (!token || busyId) return;
    setBusyId(room.unit_id);
    setError(null);
    try {
      await apiFetch(
        `/v2/units/${encodeURIComponent(room.unit_id)}/operational-status`,
        { method: "PATCH", body: JSON.stringify({ operational_status: "cleaned" }) },
        token,
      );
      setBoard((prev) =>
        prev.map((entry) =>
          entry.unit_id === room.unit_id ? { ...entry, operational_status: "cleaned" as UnitOperationalStatus } : entry,
        ),
      );
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Couldn't update the room. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <BedDouble className="h-4 w-4 text-[var(--color-secondary)]" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Room status · {board.length} active
        </h2>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILE_ORDER.map((status) => (
          <div key={status} className="rounded-2xl border border-[var(--color-border)] bg-white p-3 text-center">
            <p className={`text-2xl font-bold ${STATUS_META[status].tone}`}>{counts[status]}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
              {STATUS_META[status].label}
            </p>
          </div>
        ))}
      </div>

      {dirtyRooms.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Rooms to clean ({dirtyRooms.length})
          </p>
          <ul className="mt-2 space-y-2">
            {dirtyRooms.map((room) => (
              <li
                key={room.unit_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">{roomLabel(room)}</p>
                  {room.name && room.room_number ? (
                    <p className="truncate text-xs text-[var(--color-muted)]">{room.name}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void markCleaned(room)}
                  disabled={busyId === room.unit_id}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {busyId === room.unit_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Mark cleaned
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--color-muted)]">All rooms are clean — nothing to turn over right now.</p>
      )}

      {error ? <p className="mt-3 text-xs font-medium text-[var(--color-error)]">{error}</p> : null}
    </section>
  );
}
