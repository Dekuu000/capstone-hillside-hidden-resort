import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../../lib/serverAuth";
import { isBackOffice } from "../../../packages/shared/src/types";
import { SiteFooter } from "../../components/booking/SiteFooter";
import { ReserveClient } from "../../components/booking/ReserveClient";

export default async function ReservePage() {
  const token = await getServerAccessToken();
  if (!token) redirect("/login?next=/reserve");

  const auth = await getServerAuthContext(token);
  if (!auth) redirect("/login?next=/reserve");
  if (isBackOffice(auth.role)) redirect("/admin");

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)] pb-24 md:pb-0">
      <ReserveClient token={token} email={auth.email ?? null} />
      <SiteFooter />
    </main>
  );
}
