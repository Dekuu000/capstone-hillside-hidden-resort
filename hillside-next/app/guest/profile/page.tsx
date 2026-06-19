import { ShieldCheck, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { GuestProfileClient } from "../../../components/guest-profile/GuestProfileClient";
import { GuestHero } from "../../../components/guest/GuestHero";
import { GuestShell } from "../../../components/layout/GuestShell";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

export default async function GuestProfilePage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/profile");
  const emailHint = await getServerEmailHint();

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestHero
        dark
        eyebrow="Guest Portal"
        title="Profile &amp; Settings"
        contentClassName="lg:p-7"
        rightSlot={(
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
            <div className="flex items-center gap-2 text-base font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-white/80" aria-hidden="true" />
              Account &amp; security
            </div>
            <p className="mt-2 text-sm text-white/75">
              Manage your guest profile, login details, and an optional wallet connection.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90">
                Guest account
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90">
                <Wallet className="h-3 w-3" aria-hidden="true" />
                Wallet optional
              </span>
            </div>
          </div>
        )}
      />
      <GuestProfileClient accessToken={accessToken} initialEmail={emailHint} />
    </GuestShell>
  );
}
