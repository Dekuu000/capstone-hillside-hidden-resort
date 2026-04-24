import { redirect } from "next/navigation";
import { AdminUnitsClient } from "../../../components/admin-units/AdminUnitsClient";
import { getServerAccessToken } from "../../../lib/serverAuth";
import { fetchServerApiData } from "../../../lib/serverApi";
import { unitListResponseSchema } from "../../../../packages/shared/src/schemas";
import type { UnitListResponse } from "../../../../packages/shared/src/types";

const PAGE_SIZE = 12;

function normalizePage(raw: string | undefined): number {
  const parsed = Number(raw || "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeType(raw: string | undefined): string {
  if (raw === "room" || raw === "cottage" || raw === "amenity") return raw;
  return "";
}

function normalizeOperationalStatus(raw: string | undefined): "" | "cleaned" | "occupied" | "maintenance" | "dirty" {
  if (raw === "cleaned" || raw === "occupied" || raw === "maintenance" || raw === "dirty") return raw;
  return "";
}

function normalizeShowInactive(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

async function fetchInitialUnits(
  accessToken: string,
  page: number,
  unitType: string,
  operationalStatus: string,
  search: string,
  showInactive: boolean,
): Promise<UnitListResponse | null> {
  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(Math.max(0, (page - 1) * PAGE_SIZE)),
  });
  if (unitType) qs.set("unit_type", unitType);
  if (operationalStatus) qs.set("operational_status", operationalStatus);
  if (!showInactive) qs.set("is_active", "true");
  if (search) qs.set("search", search);
  return fetchServerApiData({
    accessToken,
    path: `/v2/units?${qs.toString()}`,
    schema: unitListResponseSchema,
    revalidate: 10,
    timeoutMs: 5000,
  });
}

export default async function AdminUnitsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/units");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizePage(
    Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page,
  );
  const unitType = normalizeType(
    Array.isArray(resolvedSearchParams.type) ? resolvedSearchParams.type[0] : resolvedSearchParams.type,
  );
  const operationalStatus = normalizeOperationalStatus(
    Array.isArray(resolvedSearchParams.operational_status)
      ? resolvedSearchParams.operational_status[0]
      : resolvedSearchParams.operational_status,
  );
  const search = (
    Array.isArray(resolvedSearchParams.search) ? resolvedSearchParams.search[0] : resolvedSearchParams.search
  )?.trim() || "";
  const showInactive = normalizeShowInactive(
    Array.isArray(resolvedSearchParams.show_inactive)
      ? resolvedSearchParams.show_inactive[0]
      : resolvedSearchParams.show_inactive,
  );
  const openUnitId = (
    Array.isArray(resolvedSearchParams.unit_id) ? resolvedSearchParams.unit_id[0] : resolvedSearchParams.unit_id
  )?.trim() || null;

  const initialData = await fetchInitialUnits(accessToken, page, unitType, operationalStatus, search, showInactive);
  return (
    <AdminUnitsClient
      initialToken={accessToken}
      initialData={initialData}
      initialType={unitType}
      initialOperationalStatus={operationalStatus}
      initialSearch={search}
      initialShowInactive={showInactive}
      initialPage={page}
      initialOpenUnitId={openUnitId}
    />
  );
}
