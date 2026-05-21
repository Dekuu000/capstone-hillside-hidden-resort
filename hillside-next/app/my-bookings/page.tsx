import { redirect } from "next/navigation";
import { MyBookingsClient } from "../../components/my-bookings/MyBookingsClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { myBookingsResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyBookingsResponse, MyBookingsTab } from "../../../packages/shared/src/types";

function normalizeTab(value?: string): MyBookingsTab {
  if (value === "pending_payment" || value === "completed" || value === "cancelled") {
    return value;
  }
  return "upcoming";
}

async function fetchInitialBookings(accessToken: string, tab: MyBookingsTab): Promise<MyBookingsResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: `/v2/me/bookings?tab=${tab}&limit=10`,
    schema: myBookingsResponseSchema,
    revalidate: 0,
  });
}

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; focus?: string; pay?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialTab = normalizeTab(resolvedSearchParams.tab);
  const initialFocusReservationId = (resolvedSearchParams.focus || "").trim() || null;
  const initialAutoOpenPay = resolvedSearchParams.pay === "1";
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/my-bookings");
  }

  const auth = await getServerAuthContext(accessToken);
  if (!auth) {
    redirect("/login?next=/my-bookings");
  }

  const initialData = await fetchInitialBookings(accessToken, initialTab);
  const emailHint = auth.email || (await getServerEmailHint());

  return (
    <GuestShell initialEmail={emailHint}>
      <MyBookingsClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialTab={initialTab}
        initialData={initialData}
        initialFocusReservationId={initialFocusReservationId}
        initialAutoOpenPay={initialAutoOpenPay}
      />
    </GuestShell>
  );
}
