import { GuestMapClient } from "../../../components/guest-map/GuestMapClient";
import { ResortLocationMap } from "../../../components/guest-map/ResortLocationMap";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestMapPage() {
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestPageIntro
        title="Resort map"
        subtitle="Find the resort and get directions, then navigate trails and facilities — the resort guide works offline, no GPS needed."
      />
      <ResortLocationMap />
      <GuestMapClient />
    </GuestShell>
  );
}
