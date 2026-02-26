import { redirect } from "next/navigation";
import { AdminUnitsClient } from "../../../components/admin-units/AdminUnitsClient";
import { getServerAccessToken } from "../../../lib/serverAuth";
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

function normalizeShowInactive(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

async function fetchInitialUnits(
  accessToken: string,
  page: number,
  unitType: string,
  search: string,
  showInactive: boolean,
): Promise<UnitListResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(Math.max(0, (page - 1) * PAGE_SIZE)),
  });
  if (unitType) qs.set("unit_type", unitType);
  if (!showInactive) qs.set("is_active", "true");
  if (search) qs.set("search", search);

  const response = await fetch(`${base}/v2/units?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const json = await response.json();
  const parsed = unitListResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
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

  const initialData = await fetchInitialUnits(accessToken, page, unitType, search, showInactive);
  return (
    <AdminUnitsClient
      initialToken={accessToken}
      initialData={initialData}
      initialType={unitType}
      initialSearch={search}
      initialShowInactive={showInactive}
      initialPage={page}
      initialOpenUnitId={openUnitId}
    />
  );
}
