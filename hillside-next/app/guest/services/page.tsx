import { ConciergeBell } from "lucide-react";
import { redirect } from "next/navigation";
import { GuestHero } from "../../../components/guest/GuestHero";
import { GuestServicesClient } from "../../../components/guest-services/GuestServicesClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestServicesPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/services");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestHero
        dark
        eyebrow="Guest Portal"
        title="Resort Services"
        contentClassName="lg:p-7"
        rightSlot={(
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
            <div className="flex items-center gap-2 text-base font-semibold text-white">
              <ConciergeBell className="h-4 w-4 text-teal-300" aria-hidden="true" />
              Service requests
            </div>
            <p className="mt-2 text-sm text-white/75">
              Submit requests now. Offline actions will auto-sync when internet is back.
            </p>
          </div>
        )}
      />
      <GuestServicesClient accessToken={accessToken} />
    </GuestShell>
  );
}
