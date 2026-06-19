import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../../../../lib/serverAuth";
import { SearchNav } from "../../../../components/booking/SearchNav";
import { SiteFooter } from "../../../../components/booking/SiteFooter";
import { PaymentClient } from "../../../../components/booking/PaymentClient";
import { isBackOffice } from "../../../../../packages/shared/src/types";

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
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SearchNav isAuthed isAdmin={isBackOffice(auth.role)} />
      <PaymentClient token={token} reservationId={reservationId} />
      <SiteFooter />
    </main>
  );
}
