import type { ContractStatusResponse, UnitItem } from "../../../packages/shared/src/types";
import { contractStatusResponseSchema, resortSnapshotResponseSchema, unitListResponseSchema } from "../../../packages/shared/src/schemas";
import { GuestVerificationPanel } from "../../components/admin-dashboard/GuestVerificationPanel";
import { LedgerExplorerPanel } from "../../components/admin-dashboard/LedgerExplorerPanel";
import { ResourceHeatmapPanel } from "../../components/admin-dashboard/ResourceHeatmapPanel";
import { ResortSnapshotPanel } from "../../components/admin-dashboard/ResortSnapshotPanel";
import { RoomInventorySyncPanel } from "../../components/admin-dashboard/RoomInventorySyncPanel";
import { RoomManagementPanel } from "../../components/admin-dashboard/RoomManagementPanel";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken } from "../../lib/serverAuth";

export default async function AdminShellPage() {
  const token = await getServerAccessToken();

  let snapshotError: string | null = null;
  let snapshot = null;
  let ledgerError: string | null = null;
  let contractStatus: ContractStatusResponse | null = null;
  let initialUnits: UnitItem[] = [];

  if (token) {
    const [snapshotData, unitsData, contractStatusData] = await Promise.all([
      fetchServerApiData({
        accessToken: token,
        path: "/v2/dashboard/resort-snapshot",
        schema: resortSnapshotResponseSchema,
        revalidate: 30,
      }),
      fetchServerApiData({
        accessToken: token,
        path: "/v2/units?limit=200&offset=0",
        schema: unitListResponseSchema,
        revalidate: 30,
      }),
      fetchServerApiData({
        accessToken: token,
        path: "/v2/escrow/contract-status?window_days=7&limit=8&offset=0",
        schema: contractStatusResponseSchema,
        revalidate: 30,
      }),
    ]);
    if (snapshotData) {
      snapshot = snapshotData;
    } else {
      snapshotError = "Unable to load resort snapshot. Please refresh or check API connectivity.";
    }

    if (unitsData) {
      initialUnits = unitsData.items ?? [];
    }

    if (contractStatusData) {
      contractStatus = contractStatusData;
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
