import { redirect } from "next/navigation";

export default async function AdminReservationLegacyRedirectPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  redirect(`/admin/reservations?reservation_id=${encodeURIComponent(reservationId)}`);
}

