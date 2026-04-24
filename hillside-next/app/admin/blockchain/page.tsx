import type { AuditLogsResponse, ContractStatusResponse, EscrowReconciliationResponse } from "../../../../packages/shared/src/types";
import { auditLogsResponseSchema, contractStatusResponseSchema, escrowReconciliationResponseSchema } from "../../../../packages/shared/src/schemas";
import { BlockchainExplorerClient } from "../../../components/admin-blockchain/BlockchainExplorerClient";
import { fetchServerApiData } from "../../../lib/serverApi";
import { getServerAccessToken } from "../../../lib/serverAuth";

type BlockchainTab = "status" | "reconciliation" | "audit";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function resolveInitialTab(raw: string | undefined): BlockchainTab {
  if (raw === "audit" || raw === "reconciliation" || raw === "status") {
    return raw;
  }
  return "status";
}

export default async function AdminBlockchainPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = await getServerAccessToken();
  const resolvedSearchParams = (await searchParams) ?? {};
  const tabRaw = firstParam(resolvedSearchParams.tab);
  const initialTab = resolveInitialTab(tabRaw);
  const initialAuditSearch = firstParam(resolvedSearchParams.search);

  let initialContractStatus: ContractStatusResponse | null = null;
  let initialContractError: string | null = null;
  let initialAuditLogs: AuditLogsResponse | null = null;
  let initialAuditError: string | null = null;
  let initialReconciliation: EscrowReconciliationResponse | null = null;
  let initialReconciliationError: string | null = null;
  const auditPath = initialAuditSearch
    ? `/v2/audit/logs?entity_type=reservation&limit=10&offset=0&search=${encodeURIComponent(initialAuditSearch)}`
    : "/v2/audit/logs?entity_type=reservation&limit=10&offset=0";

  if (!token) {
    initialContractError = "No active admin session found.";
    initialAuditError = "No active admin session found.";
  } else {
    const [contractData, auditData, reconciliationData] = await Promise.all([
      fetchServerApiData({
        accessToken: token,
        path: "/v2/escrow/contract-status?window_days=7&limit=5&offset=0",
        schema: contractStatusResponseSchema,
        revalidate: 30,
      }),
      fetchServerApiData({
        accessToken: token,
        path: auditPath,
        schema: auditLogsResponseSchema,
        revalidate: 30,
      }),
      fetchServerApiData({
        accessToken: token,
        path: "/v2/escrow/reconciliation?limit=10&offset=0",
        schema: escrowReconciliationResponseSchema,
        revalidate: 30,
      }),
    ]);
    if (contractData) {
      initialContractStatus = contractData;
    } else {
      initialContractError = "Unable to load contract status.";
    }

    if (auditData) {
      initialAuditLogs = auditData;
    } else {
      initialAuditError = "Unable to load audit logs.";
    }

    if (reconciliationData) {
      initialReconciliation = reconciliationData;
    } else {
      initialReconciliationError = "Unable to load reconciliation.";
    }
  }

  return (
    <BlockchainExplorerClient
      initialToken={token}
      initialContractStatus={initialContractStatus}
      initialAuditLogs={initialAuditLogs}
      initialContractError={initialContractError}
      initialAuditError={initialAuditError}
      initialReconciliation={initialReconciliation}
      initialReconciliationError={initialReconciliationError}
      initialTab={initialTab}
      initialAuditSearch={initialAuditSearch}
    />
  );
}
