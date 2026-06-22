import { redirect } from "next/navigation";
import { MyBookingsClient } from "../../components/my-bookings/MyBookingsClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { isBackOffice, type MyBookingsTab } from "../../../packages/shared/src/types";

function normalizeTab(value?: string): MyBookingsTab {
  if (value === "pending_payment" || value === "completed" || value === "cancelled") {
    return value;
  }
  return "upcoming";
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

  // Don't block navigation on the bookings round trip — the client paints its
  // cached snapshot instantly (stale-while-revalidate) and refreshes in the
  // background. We only await the (cached) auth check for the role gate.
  const auth = await getServerAuthContext(accessToken);
  if (!auth) {
    redirect("/login?next=/my-bookings");
  }
  if (isBackOffice(auth.role)) {
    redirect("/admin");
  }

  const emailHint = auth.email || (await getServerEmailHint());

  return (
    <GuestShell initialEmail={emailHint}>
      <MyBookingsClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialTab={initialTab}
        initialData={null}
        initialFocusReservationId={initialFocusReservationId}
        initialAutoOpenPay={initialAutoOpenPay}
      />
    </GuestShell>
  );
}
