import { ToursBookingClient } from "../../components/tours/ToursBookingClient";
import { GuestChrome } from "../../components/layout/GuestChrome";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { serviceListResponseSchema } from "../../../packages/shared/src/schemas";
import type { ServiceListResponse } from "../../../packages/shared/src/types";

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

export default async function ToursPage() {
  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const emailHint = auth?.email || (await getServerEmailHint());
  const initialServicesData = accessToken ? await fetchInitialServices(accessToken) : null;

  return (
    <GuestChrome initialEmail={emailHint}>
      <ToursBookingClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialServicesData={initialServicesData}
      />
    </GuestChrome>
  );
}
