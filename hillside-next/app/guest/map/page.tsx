import { Compass, MapPinned } from "lucide-react";
import { GuestMapClient } from "../../../components/guest-map/GuestMapClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/shared/Badge";
import { getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestMapPage() {
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <PageHeader
        title="Resort Map"
        subtitle="Browse amenities and route landmarks, even when internet is unstable."
        statusSlot={
          <>
            <Badge label="Offline-first" variant="info" />
            <Badge label="No GPS required" variant="neutral" />
          </>
        }
        rightSlot={
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
            Navigation MVP
          </div>
        }
      />
      <GuestMapClient />
    </GuestShell>
  );
}
