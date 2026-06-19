import { SyncCenter } from "../../../components/shared/SyncCenter";
import { requireRoleAtLeastServer } from "../../../lib/serverAuth";

export default async function AdminSyncPage() {
  await requireRoleAtLeastServer("super_admin");
  return (
    <SyncCenter
      scope="admin"
      title="Operations Sync Center"
      description="Monitor pending offline writes, sync health, upload commits, and conflict resolution for admin operations."
    />
  );
}
