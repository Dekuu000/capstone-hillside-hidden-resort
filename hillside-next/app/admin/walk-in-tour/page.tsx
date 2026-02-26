import { redirect } from "next/navigation";
import { AdminWalkInTourClient } from "../../../components/admin-walkin-tour/AdminWalkInTourClient";
import { getServerAccessToken } from "../../../lib/serverAuth";
import { serviceListResponseSchema } from "../../../../packages/shared/src/schemas";
import type { ServiceListResponse } from "../../../../packages/shared/src/types";

async function fetchInitialServices(accessToken: string): Promise<ServiceListResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(`${base}/v2/catalog/services`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = serviceListResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function AdminWalkInTourPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/walk-in-tour");
  }

  const initialServicesData = await fetchInitialServices(accessToken);
  return <AdminWalkInTourClient initialToken={accessToken} initialServicesData={initialServicesData} />;
}

