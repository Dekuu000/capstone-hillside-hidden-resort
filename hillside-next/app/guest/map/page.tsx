import { Compass, MapPinned } from "lucide-react";
import { GuestMapClient } from "../../../components/guest-map/GuestMapClient";
import { GuestHero } from "../../../components/guest/GuestHero";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestMapPage() {
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestHero
        dark
        eyebrow="Guest Portal"
        title="Resort Map"
        contentClassName="lg:p-7"
        rightSlot={(
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
            <div className="flex items-center gap-2 text-base font-semibold text-white">
              <Compass className="h-4 w-4 text-white/80" aria-hidden="true" />
              Map status
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <p className="inline-flex items-center gap-2 text-white/85">
                <MapPinned className="h-3.5 w-3.5 text-white/80" aria-hidden="true" />
                Interactive trails and facilities
              </p>
              <p className="text-white/75">Offline-first wayfinding with no active GPS required.</p>
            </div>
          </div>
        )}
      />
      <GuestMapClient />
    </GuestShell>
  );
}
