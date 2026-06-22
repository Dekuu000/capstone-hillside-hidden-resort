import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";
import { isBackOffice } from "../../../packages/shared/src/types";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin");
  }

  const auth = await getServerAuthContext(accessToken);
  if (!auth) {
    redirect("/login?next=/admin");
  }
  // Any back-office user (Front Desk, Manager, System Admin) may enter; guests cannot.
  if (!isBackOffice(auth.role)) {
    redirect("/my-bookings");
  }

  const emailHint = auth.email || (await getServerEmailHint());
  return (
    <AppShell initialEmail={emailHint} role={auth.role}>
      {children}
    </AppShell>
  );
}

