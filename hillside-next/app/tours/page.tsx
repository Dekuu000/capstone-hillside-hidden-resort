import { ToursBookingClient } from "../../components/tours/ToursBookingClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { serviceListResponseSchema } from "../../../packages/shared/src/schemas";
import type { ServiceListResponse } from "../../../packages/shared/src/types";

async function fetchInitialServices(accessToken: string): Promise<ServiceListResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: "/v2/catalog/services",
    schema: serviceListResponseSchema,
    revalidate: 0,
  });
}

export default async function ToursPage() {
  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const emailHint = auth?.email || (await getServerEmailHint());
  const initialServicesData = accessToken ? await fetchInitialServices(accessToken) : null;

  return (
    <GuestShell initialEmail={emailHint}>
      <ToursBookingClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialServicesData={initialServicesData}
      />
    </GuestShell>
  );
}
