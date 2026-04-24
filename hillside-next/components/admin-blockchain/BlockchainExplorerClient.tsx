"use client";

import { useCallback, useMemo, useState } from "react";
import { Activity, FileSearch, ShieldAlert } from "lucide-react";
import type { AuditLogsResponse, ChainKey, ContractStatusResponse, EscrowReconciliationResponse } from "../../../packages/shared/src/types";
import { auditLogsResponseSchema, contractStatusResponseSchema, escrowReconciliationResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { useToast } from "../shared/ToastProvider";
import { Tabs } from "../shared/Tabs";
import { AuditLogsPanel, type AuditFilterState } from "./AuditLogsPanel";
import { ContractStatusPanel } from "./ContractStatusPanel";
import { ContractStatusSkeleton } from "./ContractStatusSkeleton";
import { EscrowReconciliationPanel } from "./EscrowReconciliationPanel";

function toIsoDate(offsetDays: number) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildAuditPath(filters: AuditFilterState, page = filters.page) {
  const limit = 10;
  const offset = Math.max(0, (page - 1) * limit);
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    entity_type: "reservation",
  });
  if (filters.action) qs.set("action", filters.action);
  if (filters.search) qs.set("search", filters.search.trim());
  if (filters.from) qs.set("from", `${filters.from}T00:00:00Z`);
  if (filters.to) qs.set("to", `${filters.to}T23:59:59Z`);
  return `/v2/audit/logs?${qs.toString()}`;
}

type Props = {
  initialToken: string | null;
  initialContractStatus: ContractStatusResponse | null;
  initialAuditLogs: AuditLogsResponse | null;
  initialReconciliation: EscrowReconciliationResponse | null;
  initialTab?: "status" | "reconciliation" | "audit";
  initialAuditSearch?: string;
  initialContractError?: string | null;
  initialAuditError?: string | null;
  initialReconciliationError?: string | null;
};

export function BlockchainExplorerClient({
  initialToken,
  initialContractStatus,
  initialAuditLogs,
  initialReconciliation,
  initialTab = "status",
  initialAuditSearch = "",
  initialContractError = null,
  initialAuditError = null,
  initialReconciliationError = null,
}: Props) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"status" | "reconciliation" | "audit">(initialTab);
  const [contractStatus, setContractStatus] = useState<ContractStatusResponse | null>(initialContractStatus);
  const [contractError, setContractError] = useState<string | null>(initialContractError);
  const [contractLoading, setContractLoading] = useState(false);
  const [chainKey, setChainKey] = useState<ChainKey>(initialContractStatus?.chain_key ?? "sepolia");
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(7);
  const [contractOffset, setContractOffset] = useState(initialContractStatus?.offset ?? 0);
  const [contractLimit, setContractLimit] = useState<5 | 10 | 20>(
    initialContractStatus?.limit === 20 ? 20 : initialContractStatus?.limit === 10 ? 10 : 5,
  );
  const [reconciliation, setReconciliation] = useState<EscrowReconciliationResponse | null>(initialReconciliation);
  const [reconciliationError, setReconciliationError] = useState<string | null>(initialReconciliationError);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationOffset, setReconciliationOffset] = useState(initialReconciliation?.offset ?? 0);
  const reconciliationLimit = 10;

  const [auditLogs, setAuditLogs] = useState<AuditLogsResponse | null>(initialAuditLogs);
  const [auditError, setAuditError] = useState<string | null>(initialAuditError);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState<AuditFilterState>({
    search: initialAuditSearch,
    action: "",
    from: initialAuditSearch ? "" : toIsoDate(-7),
    to: initialAuditSearch ? "" : toIsoDate(0),
    page: 1,
    entityType: "reservation",
  });

  const fetchContractStatus = useCallback(
    async (nextChain: ChainKey, nextWindow: 7 | 14 | 30, nextOffset: number, nextLimit: 5 | 10 | 20) => {
      if (!initialToken) {
        setContractError("Missing admin session.");
        return;
      }
      setContractLoading(true);
      setContractError(null);
      try {
        const response = await apiFetch(
          `/v2/escrow/contract-status?chain_key=${encodeURIComponent(nextChain)}&window_days=${nextWindow}&limit=${nextLimit}&offset=${Math.max(0, nextOffset)}`,
          { method: "GET" },
          initialToken,
          contractStatusResponseSchema,
        );
        setContractStatus(response);
      } catch (error) {
        const message = getApiErrorMessage(error, "Failed to load contract status.");
        setContractError(message);
        showToast({ type: "error", title: "Contract status failed", message });
      } finally {
        setContractLoading(false);
      }
    },
    [initialToken, showToast],
  );

  const fetchAuditLogs = useCallback(
    async (filters: AuditFilterState, page = filters.page) => {
      if (!initialToken) {
        setAuditError("Missing admin session.");
        return;
      }
      setAuditLoading(true);
      setAuditError(null);
      try {
        const response = await apiFetch(
          buildAuditPath(filters, page),
          { method: "GET" },
          initialToken,
          auditLogsResponseSchema,
        );
        setAuditLogs(response);
      } catch (error) {
        const message = getApiErrorMessage(error, "Failed to load audit logs.");
        setAuditError(message);
        showToast({ type: "error", title: "Audit logs failed", message });
      } finally {
        setAuditLoading(false);
      }
    },
    [initialToken, showToast],
  );

  const fetchReconciliation = useCallback(
    async (nextChain: ChainKey, nextOffset = 0) => {
      if (!initialToken) {
        setReconciliationError("Missing admin session.");
        return;
      }
      setReconciliationLoading(true);
      setReconciliationError(null);
      try {
        const response = await apiFetch(
          `/v2/escrow/reconciliation?chain_key=${encodeURIComponent(nextChain)}&limit=${reconciliationLimit}&offset=${Math.max(0, nextOffset)}`,
          { method: "GET" },
          initialToken,
          escrowReconciliationResponseSchema,
        );
        setReconciliation(response);
      } catch (error) {
        const message = getApiErrorMessage(error, "Failed to load reconciliation.");
        setReconciliationError(message);
        showToast({ type: "error", title: "Reconciliation failed", message });
      } finally {
        setReconciliationLoading(false);
      }
    },
    [initialToken, showToast],
  );

  const tabItems = useMemo(
    () => [
      { id: "status", label: "Contract Status", shortLabel: "Status", icon: <Activity className="h-4 w-4" /> },
      { id: "reconciliation", label: "Reconciliation", shortLabel: "Recon", icon: <ShieldAlert className="h-4 w-4" /> },
      { id: "audit", label: "Audit Logs", shortLabel: "Audit", icon: <FileSearch className="h-4 w-4" /> },
    ],
    [],
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <header className="surface p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">Blockchain Explorer</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Contract Status + Audit Logs</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Internal observability for escrow chain health, successful transactions, and reservation audit history.
        </p>
      </header>

      <Tabs
        items={tabItems}
        value={activeTab}
        onChange={(value) => setActiveTab(value as "status" | "reconciliation" | "audit")}
        className="sm:grid-cols-3"
      />

      {activeTab === "status" ? (
        contractLoading && !contractStatus ? (
          <ContractStatusSkeleton />
        ) : (
          <ContractStatusPanel
            data={contractStatus}
            loading={contractLoading}
            error={contractError}
            chainKey={chainKey}
            windowDays={windowDays}
            onChangeChain={(next) => {
              setChainKey(next);
              setContractOffset(0);
              void fetchContractStatus(next, windowDays, 0, contractLimit);
            }}
            onChangeWindow={(next) => {
              setWindowDays(next);
              setContractOffset(0);
              void fetchContractStatus(chainKey, next, 0, contractLimit);
            }}
            onRefresh={() => void fetchContractStatus(chainKey, windowDays, contractOffset, contractLimit)}
            contractLimit={contractLimit}
            onChangeLimit={(next) => {
              setContractLimit(next);
              setContractOffset(0);
              void fetchContractStatus(chainKey, windowDays, 0, next);
            }}
            onPageChange={(nextOffset) => {
              setContractOffset(nextOffset);
              void fetchContractStatus(chainKey, windowDays, nextOffset, contractLimit);
            }}
          />
        )
      ) : activeTab === "reconciliation" ? (
        <EscrowReconciliationPanel
          data={reconciliation}
          loading={reconciliationLoading}
          error={reconciliationError}
          chainKey={chainKey}
          enabledChains={contractStatus?.enabled_chain_keys?.length ? contractStatus.enabled_chain_keys : [chainKey]}
          onChangeChain={(next) => {
            setChainKey(next);
            setReconciliationOffset(0);
            void fetchReconciliation(next, 0);
          }}
          onRefresh={() => void fetchReconciliation(chainKey, reconciliationOffset)}
          onPageChange={(nextOffset) => {
            setReconciliationOffset(nextOffset);
            void fetchReconciliation(chainKey, nextOffset);
          }}
        />
      ) : (
        <AuditLogsPanel
          data={auditLogs}
          loading={auditLoading}
          error={auditError}
          filters={auditFilters}
          onChangeFilters={(next) => {
            const resetPage = ("search" in next) || ("action" in next) || ("from" in next) || ("to" in next);
            setAuditFilters((prev) => ({
              ...prev,
              ...next,
              page: next.page ?? (resetPage ? 1 : prev.page),
            }));
          }}
          onApplyFilters={() => {
            setAuditFilters((prev) => ({ ...prev, page: 1 }));
            void fetchAuditLogs({ ...auditFilters, page: 1 }, 1);
          }}
          onResetFilters={() => {
            const resetFilters: AuditFilterState = {
              search: "",
              action: "",
              from: toIsoDate(-7),
              to: toIsoDate(0),
              page: 1,
              entityType: "reservation",
            };
            setAuditFilters(resetFilters);
            void fetchAuditLogs(resetFilters, 1);
          }}
          onRefresh={() => void fetchAuditLogs(auditFilters, auditFilters.page)}
          onPageChange={(nextPage) => {
            setAuditFilters((prev) => ({ ...prev, page: nextPage }));
            void fetchAuditLogs({ ...auditFilters, page: nextPage }, nextPage);
          }}
        />
      )}
    </section>
  );
}
