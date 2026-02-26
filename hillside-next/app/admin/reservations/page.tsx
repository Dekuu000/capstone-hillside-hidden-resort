import { redirect } from "next/navigation";
import { AdminReservationsClient } from "../../../components/admin-reservations/AdminReservationsClient";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";
import { reservationListResponseSchema } from "../../../../packages/shared/src/schemas";
import type { ReservationListResponse } from "../../../../packages/shared/src/types";

async function fetchInitialReservations(accessToken: string): Promise<ReservationListResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(
    `${base}/v2/reservations?limit=10&offset=0&sort_by=created_at&sort_dir=desc`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = reservationListResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/reservations");
  }

  const resolved = (await searchParams) ?? {};
  const initialOpenReservationId = Array.isArray(resolved.reservation_id)
    ? resolved.reservation_id[0]
    : resolved.reservation_id || null;

  const initialData = await fetchInitialReservations(accessToken);
  const emailHint = await getServerEmailHint();

  return (
    <AdminReservationsClient
      initialToken={accessToken}
      initialSessionEmail={emailHint}
      initialData={initialData}
      initialOpenReservationId={initialOpenReservationId}
    />
  );
}
