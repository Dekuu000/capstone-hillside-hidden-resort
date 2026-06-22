import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { AdminTeamClient } from "../../../components/admin-team/AdminTeamClient";
import { AdminPageHeader } from "../../../components/layout/AdminPageHeader";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { canManageTeam, type Role } from "../../../../packages/shared/src/types";

export default async function AdminTeamPage() {
  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;

  // Manager and System Admin only. Front Desk (and signed-out) bounce home.
  if (!auth || !canManageTeam(auth.role)) {
    redirect("/admin");
  }

  const role = auth.role as Role;

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Management"
        title="Team"
        subtitle="Create and manage back-office accounts for your resort staff."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <Users className="h-3.5 w-3.5 text-[var(--color-cta)]" />
            Account management
          </span>
        }
      />
      <AdminTeamClient accessToken={accessToken} role={role} currentUserId={auth.user_id} />
    </section>
  );
}
