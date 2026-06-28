import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../../../../lib/serverAuth";
import { SiteFooter } from "../../../../components/booking/SiteFooter";
import { PaymentClient } from "../../../../components/booking/PaymentClient";

export default async function ReservePaymentPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const token = await getServerAccessToken();
  if (!token) redirect(`/login?next=/reserve/${reservationId}/pay`);

  const auth = await getServerAuthContext(token);
  if (!auth) redirect(`/login?next=/reserve/${reservationId}/pay`);

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[calc(104px_+_env(safe-area-inset-bottom))] md:pb-0">
      <PaymentClient token={token} reservationId={reservationId} />
      <SiteFooter />
    </main>
  );
}
