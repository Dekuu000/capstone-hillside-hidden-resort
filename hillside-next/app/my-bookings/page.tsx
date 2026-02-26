import { redirect } from "next/navigation";
import { MyBookingsClient } from "../../components/my-bookings/MyBookingsClient";
import { GuestChrome } from "../../components/layout/GuestChrome";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { myBookingsResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyBookingsResponse } from "../../../packages/shared/src/types";

async function fetchInitialBookings(accessToken: string): Promise<MyBookingsResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(`${base}/v2/me/bookings?tab=upcoming&limit=10`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = myBookingsResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
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
    <GuestChrome initialEmail={emailHint}>
      <MyBookingsClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialData={initialData}
      />
    </GuestChrome>
  );
}
