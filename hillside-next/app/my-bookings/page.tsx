import { redirect } from "next/navigation";
import { MyBookingsClient } from "../../components/my-bookings/MyBookingsClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { stayDashboardResponseSchema } from "../../../packages/shared/src/schemas";
import type { StayDashboardResponse } from "../../../packages/shared/src/types";
import { formatDateWithWeekday } from "../../lib/dateDisplay";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { isBackOffice, type MyBookingsTab } from "../../../packages/shared/src/types";

function normalizeTab(value?: string): MyBookingsTab {
  if (value === "pending_payment" || value === "completed" || value === "cancelled") {
    return value;
  }
  return "upcoming";
}

function getQrStatusLabel(status: string) {
  if (["confirmed", "checked_in"].includes(status)) {
    return "QR ready";
  }
  if (["pending_payment", "for_verification"].includes(status)) {
    return "After payment";
  }
  return "No QR yet";
}

async function fetchStayDashboard(accessToken: string): Promise<StayDashboardResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: "/v2/me/stay-dashboard",
    schema: stayDashboardResponseSchema,
  });
}

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; focus?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialTab = normalizeTab(resolvedSearchParams.tab);
  const initialFocusReservationId = (resolvedSearchParams.focus || "").trim() || null;
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

  const [emailHint, stayDashboard] = await Promise.all([
    auth.email ? Promise.resolve(auth.email) : getServerEmailHint(),
    fetchStayDashboard(accessToken),
  ]);

  const stay = stayDashboard?.reservation ?? null;
  const staySnapshot = stay
    ? {
        nextStayDate: formatDateWithWeekday(stay.check_in_date || null),
        outstandingBalance: toPeso(Number(stay.balance_due ?? 0)),
        qrStatus: getQrStatusLabel(stay.status),
      }
    : null;

  return (
    <GuestShell initialEmail={emailHint}>
      <MyBookingsClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialTab={initialTab}
        initialData={null}
        initialFocusReservationId={initialFocusReservationId}
        staySnapshot={staySnapshot}
      />
    </GuestShell>
  );
}
