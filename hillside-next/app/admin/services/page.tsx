import { ConciergeBell } from "lucide-react";
import { AdminServicesClient } from "../../../components/admin-services/AdminServicesClient";
import { PageHeader } from "../../../components/layout/PageHeader";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminServicesPage() {
  const accessToken = await getServerAccessToken();

  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-4">
      <PageHeader
        title="Service Queue"
        subtitle="Manage room-service and spa requests."
        rightSlot={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <ConciergeBell className="h-3.5 w-3.5" />
            Front desk queue
          </span>
        }
      />
      <AdminServicesClient accessToken={accessToken} />
    </section>
  );
}
