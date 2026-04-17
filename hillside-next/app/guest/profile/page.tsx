import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { GuestProfileClient } from "../../../components/guest-profile/GuestProfileClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/shared/Badge";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestProfilePage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/profile");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <PageHeader
        title="Profile & Settings"
        subtitle="Manage guest profile, account security, and optional wallet connection."
        statusSlot={
          <>
            <Badge label="Guest account" variant="info" />
            <Badge label="Wallet optional" variant="neutral" />
          </>
        }
        rightSlot={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </span>
        }
      />
      <GuestProfileClient accessToken={accessToken} initialEmail={emailHint} />
    </GuestShell>
  );
}
