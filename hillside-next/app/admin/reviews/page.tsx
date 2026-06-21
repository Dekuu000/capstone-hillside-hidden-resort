import { Star } from "lucide-react";
import { AdminReviewsClient } from "../../../components/admin-reviews/AdminReviewsClient";
import { AdminPageHeader } from "../../../components/layout/AdminPageHeader";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminReviewsPage() {
  const accessToken = await getServerAccessToken();

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Management"
        title="Guest reviews"
        subtitle="Read reviews from verified stays and hide any that break the rules."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <Star className="h-3.5 w-3.5 fill-[var(--color-cta)] text-[var(--color-cta)]" />
            Verified-stay reviews
          </span>
        }
      />
      <AdminReviewsClient accessToken={accessToken} />
    </section>
  );
}
