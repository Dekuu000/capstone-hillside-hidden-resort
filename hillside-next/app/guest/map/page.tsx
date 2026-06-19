import { GuestMapClient } from "../../../components/guest-map/GuestMapClient";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestMapPage() {
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestPageIntro
        title="Resort map"
        subtitle="Find trails and facilities and get walking directions — works offline, no GPS needed."
      />
      <GuestMapClient />
    </GuestShell>
  );
}
