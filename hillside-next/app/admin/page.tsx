import { roleAtLeast, type ContractStatusResponse, type UnitItem } from "../../../packages/shared/src/types";
import { contractStatusResponseSchema, resortSnapshotResponseSchema, unitListResponseSchema } from "../../../packages/shared/src/schemas";
import { GuestVerificationPanel } from "../../components/admin-dashboard/GuestVerificationPanel";
import { LedgerExplorerPanel } from "../../components/admin-dashboard/LedgerExplorerPanel";
import { ResourceHeatmapPanel } from "../../components/admin-dashboard/ResourceHeatmapPanel";
import { ResortSnapshotPanel } from "../../components/admin-dashboard/ResortSnapshotPanel";
import { RoomInventorySyncPanel } from "../../components/admin-dashboard/RoomInventorySyncPanel";
import { RoomManagementPanel } from "../../components/admin-dashboard/RoomManagementPanel";
import { AdminPageHeader } from "../../components/layout/AdminPageHeader";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext } from "../../lib/serverAuth";

export default async function AdminShellPage() {
  const token = await getServerAccessToken();
  const auth = token ? await getServerAuthContext(token) : null;
  // The on-chain ledger is a System Admin (technical) tool — hide it from Managers/Front Desk.
  const canSeeLedger = roleAtLeast(auth?.role, "super_admin");

  let snapshotError: string | null = null;
  let snapshot = null;
  let ledgerError: string | null = null;
  let contractStatus: ContractStatusResponse | null = null;
  let initialUnits: UnitItem[] = [];

  if (token) {
    const [snapshotData, unitsData] = await Promise.all([
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
    ]);
    if (snapshotData) {
      snapshot = snapshotData;
    } else {
      snapshotError = "Unable to load resort snapshot. Please refresh or check API connectivity.";
    }

    if (unitsData) {
      initialUnits = unitsData.items ?? [];
    }

    if (canSeeLedger) {
      contractStatus = await fetchServerApiData({
        accessToken: token,
        path: "/v2/escrow/contract-status?window_days=7&limit=8&offset=0",
        schema: contractStatusResponseSchema,
        revalidate: 30,
      });
      if (!contractStatus) {
        ledgerError = "Unable to load ledger transactions. Open Records & Security for full diagnostics.";
      }
    }
  } else {
    snapshotError = "No active admin session found. Please sign in again.";
  }

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5 pb-2">
      <AdminPageHeader
        eyebrow="Admin Dashboard"
        title="Resort View"
        subtitle="Snapshot, room operations, and guest verification in one unified workspace."
      />

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.45fr_1fr] 2xl:grid-cols-[1.55fr_1fr]">
        <ResortSnapshotPanel snapshot={snapshot} error={snapshotError} />
        <GuestVerificationPanel />
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_1.15fr] 2xl:grid-cols-[1fr_1.2fr]">
        <RoomInventorySyncPanel units={initialUnits} />
        <ResourceHeatmapPanel snapshot={snapshot} />
      </div>

      {canSeeLedger ? <LedgerExplorerPanel contractStatus={contractStatus} error={ledgerError} /> : null}

      <RoomManagementPanel initialToken={token} initialUnits={initialUnits} />
    </section>
  );
}

