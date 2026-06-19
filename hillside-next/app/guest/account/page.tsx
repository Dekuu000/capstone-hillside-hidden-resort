import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BedDouble, ChevronRight, CalendarCheck, MapPin, Settings, type LucideIcon } from "lucide-react";
import { GuestShell } from "../../../components/layout/GuestShell";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { SignOutButton } from "../../../components/guest/SignOutButton";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../../lib/serverAuth";
import { isBackOffice } from "../../../../packages/shared/src/types";

const ACCOUNT_LINKS: { href: string; label: string; desc: string; icon: LucideIcon; wide?: boolean }[] = [
  { href: "/guest/my-stay", label: "My stay", desc: "Active stay, balance & check-in pass", icon: BedDouble },
  { href: "/my-bookings", label: "My trips", desc: "Bookings, payments & history", icon: CalendarCheck },
  { href: "/guest/map", label: "Resort map", desc: "Trails & facilities, works offline", icon: MapPin },
  { href: "/guest/services", label: "Services", desc: "Room service & spa requests", icon: Bell },
  { href: "/guest/profile", label: "Account settings", desc: "Name, email & password", icon: Settings, wide: true },
];

export default async function GuestAccountPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/account");
  const auth = await getServerAuthContext(accessToken);
  if (isBackOffice(auth?.role)) {
    redirect("/admin");
  }

  const email = auth?.email || (await getServerEmailHint()) || "Guest";
  const initial = (email.trim().charAt(0) || "G").toUpperCase();

  return (
    <GuestShell initialEmail={email}>
      <div className="mx-auto w-full max-w-4xl space-y-5">
      <GuestPageIntro title="Profile" subtitle="Your stay, bookings, and account in one place." />

      <section className="flex items-center gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xl font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-[var(--color-text)]">Guest</p>
          <p className="truncate text-sm muted-text">{email}</p>
        </div>
      </section>

      <nav className="grid gap-3 sm:grid-cols-2">
        {ACCOUNT_LINKS.map(({ href, label, desc, icon: Icon, wide }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 transition hover:shadow-[var(--shadow-md)] ${wide ? "sm:col-span-2" : ""}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[var(--color-text)] group-hover:underline">{label}</span>
              <span className="block truncate text-xs muted-text">{desc}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
          </Link>
        ))}
      </nav>

      <SignOutButton />
      </div>
    </GuestShell>
  );
}
