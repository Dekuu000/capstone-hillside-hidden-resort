import { redirect } from "next/navigation";
import type { ServiceListResponse } from "../../../../packages/shared/src/types";
import { serviceListResponseSchema } from "../../../../packages/shared/src/schemas";
import { AdminWalkInConsoleClient } from "../../../components/admin-walkin/AdminWalkInConsoleClient";
import { fetchServerApiData } from "../../../lib/serverApi";
import { getServerAccessToken } from "../../../lib/serverAuth";

async function fetchInitialServices(accessToken: string): Promise<ServiceListResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: "/v2/catalog/services",
    schema: serviceListResponseSchema,
    revalidate: 30,
  });
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

