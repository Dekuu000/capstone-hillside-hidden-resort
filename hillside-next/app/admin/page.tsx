import { cookies } from "next/headers";
import type { ContractStatusResponse, UnitItem } from "../../../packages/shared/src/types";
import { contractStatusResponseSchema, resortSnapshotResponseSchema, unitListResponseSchema } from "../../../packages/shared/src/schemas";
import { GuestVerificationPanel } from "../../components/admin-dashboard/GuestVerificationPanel";
import { LedgerExplorerPanel } from "../../components/admin-dashboard/LedgerExplorerPanel";
import { ResourceHeatmapPanel } from "../../components/admin-dashboard/ResourceHeatmapPanel";
import { ResortSnapshotPanel } from "../../components/admin-dashboard/ResortSnapshotPanel";
import { RoomInventorySyncPanel } from "../../components/admin-dashboard/RoomInventorySyncPanel";
import { RoomManagementPanel } from "../../components/admin-dashboard/RoomManagementPanel";

function getApiBase() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
}

async function fetchJson(path: string, accessToken: string): Promise<unknown | null> {
  const base = getApiBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 30 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default async function AdminShellPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hs_at")?.value || null;

  let snapshotError: string | null = null;
  let snapshot = null;
  let ledgerError: string | null = null;
  let contractStatus: ContractStatusResponse | null = null;
  let initialUnits: UnitItem[] = [];

  if (token) {
    const [snapshotJson, unitsJson, contractStatusJson] = await Promise.all([
      fetchJson("/v2/dashboard/resort-snapshot", token),
      fetchJson("/v2/units?limit=200&offset=0", token),
      fetchJson("/v2/escrow/contract-status?window_days=7&limit=8&offset=0", token),
    ]);

    const snapshotParsed = resortSnapshotResponseSchema.safeParse(snapshotJson);
    if (snapshotParsed.success) {
      snapshot = snapshotParsed.data;
    } else {
      snapshotError = "Unable to load resort snapshot. Please refresh or check API connectivity.";
    }

    const unitsParsed = unitListResponseSchema.safeParse(unitsJson);
    if (unitsParsed.success) {
      initialUnits = unitsParsed.data.items ?? [];
    }

    const contractStatusParsed = contractStatusResponseSchema.safeParse(contractStatusJson);
    if (contractStatusParsed.success) {
      contractStatus = contractStatusParsed.data;
    } else {
      ledgerError = "Unable to load ledger transactions. Open Blockchain page for full diagnostics.";
    }
  } else {
    snapshotError = "No active admin session found. Please sign in again.";
    ledgerError = "No active admin session found. Please sign in again.";
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <header className="surface p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted)]">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Resort View</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Snapshot, room management, and guest verification in one operations screen.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <ResortSnapshotPanel snapshot={snapshot} error={snapshotError} />
        <GuestVerificationPanel />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <RoomInventorySyncPanel units={initialUnits} />
        <ResourceHeatmapPanel snapshot={snapshot} />
      </div>

      <LedgerExplorerPanel contractStatus={contractStatus} error={ledgerError} />

      <RoomManagementPanel initialToken={token} initialUnits={initialUnits} />
    </section>
  );
}
