import { Tag } from "lucide-react";
import { AdminPromosClient } from "../../../components/admin-promos/AdminPromosClient";
import { AdminPageHeader } from "../../../components/layout/AdminPageHeader";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminPromosPage() {
  const accessToken = await getServerAccessToken();

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Management"
        title="Promos"
        subtitle="Create discount codes guests can apply at checkout. Discounts apply to the booking total before the deposit."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <Tag className="h-3.5 w-3.5 text-[var(--color-cta)]" />
            Discount codes
          </span>
        }
      />
      <AdminPromosClient accessToken={accessToken} />
    </section>
  );
}
