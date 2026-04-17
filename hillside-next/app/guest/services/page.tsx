import { ConciergeBell } from "lucide-react";
import { redirect } from "next/navigation";
import { GuestServicesClient } from "../../../components/guest-services/GuestServicesClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestServicesPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/services");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <PageHeader
        title="Resort Services"
        subtitle="Order room service and spa requests from your guest portal."
        rightSlot={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <ConciergeBell className="h-3.5 w-3.5" />
            Guest requests
          </span>
        }
      />
      <GuestServicesClient accessToken={accessToken} />
    </GuestShell>
  );
}
