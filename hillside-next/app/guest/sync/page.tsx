import { GuestShell } from "../../../components/layout/GuestShell";
import { SyncCenter } from "../../../components/shared/SyncCenter";

export default function GuestSyncPage() {
  return (
    <GuestShell>
      <SyncCenter
        scope="me"
        title="My Sync Center"
        description="Track queued offline actions, pending uploads, and sync completion for your bookings."
      />
    </GuestShell>
  );
}
