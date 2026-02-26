import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminChrome } from "../../components/layout/AdminChrome";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/reservations");
  }

  const auth = await getServerAuthContext(accessToken);
  if (!auth) {
    redirect("/login?next=/admin/reservations");
  }
  if (String(auth.role).toLowerCase() !== "admin") {
    redirect("/my-bookings");
  }

  const emailHint = auth.email || (await getServerEmailHint());
  return <AdminChrome initialEmail={emailHint}>{children}</AdminChrome>;
}

