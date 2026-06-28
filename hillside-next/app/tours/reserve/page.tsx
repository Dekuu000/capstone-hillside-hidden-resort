import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { isBackOffice } from "../../../../packages/shared/src/types";
import { SiteFooter } from "../../../components/booking/SiteFooter";
import { TourReserveClient } from "../../../components/booking/TourReserveClient";

export default async function TourReservePage() {
  const token = await getServerAccessToken();
  if (!token) redirect("/login?next=/tours/reserve");

  const auth = await getServerAuthContext(token);
  if (!auth) redirect("/login?next=/tours/reserve");
  if (isBackOffice(auth.role)) redirect("/admin");

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[calc(104px_+_env(safe-area-inset-bottom))] md:pb-0">
      <TourReserveClient token={token} email={auth.email ?? null} />
      <SiteFooter />
    </main>
  );
}
