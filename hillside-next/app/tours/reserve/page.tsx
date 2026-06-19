import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { isBackOffice } from "../../../../packages/shared/src/types";
import { SearchNav } from "../../../components/booking/SearchNav";
import { SiteFooter } from "../../../components/booking/SiteFooter";
import { TourReserveClient } from "../../../components/booking/TourReserveClient";

export default async function TourReservePage() {
  const token = await getServerAccessToken();
  if (!token) redirect("/login?next=/tours/reserve");

  const auth = await getServerAuthContext(token);
  if (!auth) redirect("/login?next=/tours/reserve");
  if (isBackOffice(auth.role)) redirect("/admin");

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SearchNav isAuthed isAdmin={false} />
      <TourReserveClient token={token} email={auth.email ?? null} />
      <SiteFooter />
    </main>
  );
}
