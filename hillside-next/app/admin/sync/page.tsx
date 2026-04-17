import { SyncCenter } from "../../../components/shared/SyncCenter";

export default function AdminSyncPage() {
  return (
    <SyncCenter
      scope="admin"
      title="Operations Sync Center"
      description="Monitor pending offline writes, sync health, upload commits, and conflict resolution for admin operations."
    />
  );
}
