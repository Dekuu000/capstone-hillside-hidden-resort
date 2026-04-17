import { redirect } from "next/navigation";
import type { ServiceListResponse } from "../../../../packages/shared/src/types";
import { serviceListResponseSchema } from "../../../../packages/shared/src/schemas";
import { AdminWalkInConsoleClient } from "../../../components/admin-walkin/AdminWalkInConsoleClient";
import { getServerAccessToken } from "../../../lib/serverAuth";

async function fetchInitialServices(accessToken: string): Promise<ServiceListResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(`${base}/v2/catalog/services`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    next: { revalidate: 30 },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = serviceListResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function AdminWalkInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/walk-in");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const tabRaw = Array.isArray(resolvedSearchParams.tab) ? resolvedSearchParams.tab[0] : resolvedSearchParams.tab;
  const initialTab = tabRaw === "tour" ? "tour" : "stay";

  const initialServicesData = await fetchInitialServices(accessToken);
  return (
    <AdminWalkInConsoleClient
      initialToken={accessToken}
      initialServicesData={initialServicesData}
      initialTab={initialTab}
    />
  );
}

