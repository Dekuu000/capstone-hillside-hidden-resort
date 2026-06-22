import { ConciergeBell } from "lucide-react";
import { AdminServicesClient } from "../../../components/admin-services/AdminServicesClient";
import { AdminPageHeader } from "../../../components/layout/AdminPageHeader";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminServicesPage() {
  const accessToken = await getServerAccessToken();

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Operations"
        title="Service Queue"
        subtitle="Manage room-service and spa requests."
        action={
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
