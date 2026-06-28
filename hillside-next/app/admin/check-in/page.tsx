import { AdminCheckinClient } from "../../../components/admin-checkin/AdminCheckinClient";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";

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
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const resolvedSearchParams = (await searchParams) ?? {};
  const modeParam = Array.isArray(resolvedSearchParams.mode) ? resolvedSearchParams.mode[0] : resolvedSearchParams.mode;
  const viewParam = Array.isArray(resolvedSearchParams.view) ? resolvedSearchParams.view[0] : resolvedSearchParams.view;
  const reservationCodeParam = Array.isArray(resolvedSearchParams.reservation_code)
    ? resolvedSearchParams.reservation_code[0]
    : resolvedSearchParams.reservation_code;
  const initialMode = normalizeMode(modeParam);
  const tabletView = viewParam === "tablet";
  // Only the mobile "Scan QR" FAB links with an explicit ?mode=scan; a plain
  // Check-in visit (desktop sidebar) has no param, so it won't auto-start the camera.
  const autoStartScan = modeParam === "scan";
  return (
    <AdminCheckinClient
      initialToken={accessToken}
      initialMode={initialMode}
      tabletView={tabletView}
      autoStartScan={autoStartScan}
      initialReservationCode={typeof reservationCodeParam === "string" ? reservationCodeParam : undefined}
      role={auth?.role ?? null}
    />
  );
}
