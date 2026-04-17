import { AdminCheckinClient } from "../../../components/admin-checkin/AdminCheckinClient";
import { getServerAccessToken } from "../../../lib/serverAuth";

function normalizeMode(raw: string | undefined): "scan" | "code" | "queue" {
  if (raw === "code" || raw === "queue" || raw === "scan") return raw;
  return "scan";
}

export default async function AdminCheckInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  const resolvedSearchParams = (await searchParams) ?? {};
  const modeParam = Array.isArray(resolvedSearchParams.mode) ? resolvedSearchParams.mode[0] : resolvedSearchParams.mode;
  const viewParam = Array.isArray(resolvedSearchParams.view) ? resolvedSearchParams.view[0] : resolvedSearchParams.view;
  const reservationCodeParam = Array.isArray(resolvedSearchParams.reservation_code)
    ? resolvedSearchParams.reservation_code[0]
    : resolvedSearchParams.reservation_code;
  const initialMode = normalizeMode(modeParam);
  const tabletView = viewParam === "tablet";
  return (
    <AdminCheckinClient
      initialToken={accessToken}
      initialMode={initialMode}
      tabletView={tabletView}
      initialReservationCode={typeof reservationCodeParam === "string" ? reservationCodeParam : undefined}
    />
  );
}
