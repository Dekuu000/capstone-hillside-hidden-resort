import { redirect } from "next/navigation";
import { getServerAccessToken } from "../../../../../lib/serverAuth";
import { PaymentResultClient } from "../../../../../components/booking/PaymentResultClient";

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const token = await getServerAccessToken();
  if (!token) redirect(`/login?next=/reserve/${reservationId}/pay/success`);

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <PaymentResultClient token={token} reservationId={reservationId} />
    </main>
  );
}
