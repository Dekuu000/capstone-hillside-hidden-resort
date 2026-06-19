"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarDays, TreePalm, UserRound } from "lucide-react";
import { safeGetSession, getSupabaseBrowserClient } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { HillsideLogo } from "../branding/HillsideLogo";
import { GuestBottomNav } from "../guest/GuestBottomNav";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

// Primary destinations (top tabs on desktop, first slots on the mobile bar).
const primaryNav = [
  { label: "Stays", href: "/stays", icon: CalendarDays },
  { label: "Tours", href: "/tours", icon: TreePalm },
  { label: "Trips", href: "/my-bookings", icon: BedDouble },
];

// The avatar / Profile entry is its own destination (Airbnb-style account hub).
const profileNav = { label: "Profile", href: "/guest/account", icon: UserRound };
const bottomNav = [...primaryNav, profileNav];

export function GuestChrome({ children, initialName = null }: GuestChromeProps) {
  const pathname = usePathname();
  const [name, setName] = useState(initialName || "Guest");

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted || !session?.user || initialName) return;
      setName(resolveUserDisplayName(session.user, "Guest"));
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || !session?.user || initialName) return;
      setName(resolveUserDisplayName(session.user, "Guest"));
    });
    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [initialName]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "G", [name]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // The Profile hub and account settings page share the avatar's active state.
  const profileActive = isActive(profileNav.href) || isActive("/guest/profile");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <header data-testid="guest-header" className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-[70px] w-full max-w-[430px] items-center justify-between px-4 md:h-20 md:max-w-[1440px] md:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <HillsideLogo compact className="[&_svg]:h-9 [&_svg]:w-9 min-[390px]:[&_svg]:h-10 min-[390px]:[&_svg]:w-10 [&_p:first-of-type]:text-[1.2rem] [&_p:first-of-type]:font-semibold min-[390px]:[&_p:first-of-type]:text-[1.3rem] [&_p:last-child]:text-[0.62rem] [&_p:last-child]:tracking-[0.30em] md:[&_svg]:h-11 md:[&_svg]:w-11 md:[&_p:first-of-type]:text-[1.6rem] md:[&_p:last-child]:text-[0.68rem]" />
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {primaryNav.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
                  }`}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href={profileNav.href}
            aria-label="Profile and account"
            aria-current={profileActive ? "page" : undefined}
            className={`inline-flex h-11 items-center gap-2 rounded-full border bg-[var(--color-surface)] px-2 pr-3 shadow-sm transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)] ${
              profileActive ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
            }`}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
              {initial}
            </span>
            <span className="hidden text-sm font-semibold text-[var(--color-text)] sm:inline">Profile</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 overflow-x-hidden px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <GuestBottomNav items={bottomNav} isActive={isActive} />
    </div>
  );
}
