import { TreePalm } from "lucide-react";
import { AdminToursClient } from "../../../components/admin-tours/AdminToursClient";
import { AdminPageHeader } from "../../../components/layout/AdminPageHeader";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminToursPage() {
  const accessToken = await getServerAccessToken();

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Management"
        title="Tours"
        subtitle="Upload and manage the photos guests see for your Day Tour and Night Tour."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <TreePalm className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
            Tour photos
          </span>
        }
      />
      <AdminToursClient accessToken={accessToken} />
    </section>
  );
}
