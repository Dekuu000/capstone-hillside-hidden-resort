import { redirect } from "next/navigation";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { GuestServicesClient } from "../../../components/guest-services/GuestServicesClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestServicesPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/services");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestPageIntro
        title="Resort services"
        subtitle="Order room service or book the spa. Requests reach the front desk right away, and save offline if you lose signal."
      />
      <GuestServicesClient accessToken={accessToken} />
    </GuestShell>
  );
}
