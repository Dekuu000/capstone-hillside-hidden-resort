import { redirect } from "next/navigation";
import { GuestProfileClient } from "../../../components/guest-profile/GuestProfileClient";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestProfilePage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/profile");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestPageIntro
        title="Account settings"
        subtitle="Manage your guest details and account security."
      />
      <GuestProfileClient accessToken={accessToken} initialEmail={emailHint} />
    </GuestShell>
  );
}
