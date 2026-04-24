import { redirect } from "next/navigation";
import { MyBookingsClient } from "../../components/my-bookings/MyBookingsClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { myBookingsResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyBookingsResponse } from "../../../packages/shared/src/types";

async function fetchInitialBookings(accessToken: string): Promise<MyBookingsResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: "/v2/me/bookings?tab=upcoming&limit=10",
    schema: myBookingsResponseSchema,
    revalidate: 0,
  });
}

export default async function MyBookingsPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/my-bookings");
  }

  const auth = await getServerAuthContext(accessToken);
  if (!auth) {
    redirect("/login?next=/my-bookings");
  }

  const initialData = await fetchInitialBookings(accessToken);
  const emailHint = auth.email || (await getServerEmailHint());

  return (
    <GuestShell initialEmail={emailHint}>
      <MyBookingsClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialData={initialData}
      />
    </GuestShell>
  );
}
