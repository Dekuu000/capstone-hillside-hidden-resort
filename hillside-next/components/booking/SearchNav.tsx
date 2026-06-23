import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { GUEST_HEADER_LOGO_CLASS, HillsideLogo } from "../branding/HillsideLogo";
import { PrimaryNavTabs } from "../guest/PrimaryNavTabs";
import { ProfilePill } from "../guest/ProfilePill";
import { NotificationBell } from "../shared/NotificationBell";

type SearchNavProps = {
  isAuthed?: boolean;
  isAdmin?: boolean;
  initialName?: string | null;
};

// Logged-out public nav also carries Sign in / Sign up, so the one-liner title
// runs a touch smaller on small phones to avoid truncation. When signed in the
// auth buttons are gone (and the avatar is hidden on mobile), so the brand uses
// the shared, larger guest-header size — matching the logged-in shell exactly.
const PUBLIC_NAV_LOGO_CLASS =
  "[&_img]:h-8 [&_img]:w-8 min-[390px]:[&_img]:h-9 min-[390px]:[&_img]:w-9 md:[&_img]:h-11 md:[&_img]:w-11 " +
  "[&_.hillside-brand-title]:text-[0.92rem] min-[400px]:[&_.hillside-brand-title]:text-[1.05rem] " +
  "min-[480px]:[&_.hillside-brand-title]:text-[1.2rem] sm:[&_.hillside-brand-title]:text-[1.3rem] md:[&_.hillside-brand-title]:text-[1.55rem]";

/** Sticky top bar for the public funnel — matches the logged-in guest header. */
export function SearchNav({ isAuthed = false, isAdmin = false, initialName = null }: SearchNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="relative mx-auto flex h-[70px] w-full max-w-[1440px] items-center justify-between gap-3 px-4 md:h-20 md:px-6 lg:px-8">
        {/* Brand — public funnel always shows the emblem + wordmark on the left.
            When signed in, the emblem+wordmark only shows on desktop (lg+), where
            the center holds the nav tabs; on mobile the center is empty so we
            show a clean centered wordmark (no emblem) instead. */}
        <Link
          href="/"
          className={`min-w-0 items-center ${isAuthed ? "hidden lg:flex" : "flex"}`}
          aria-label="Hillside Hidden Resort home"
        >
          <HillsideLogo oneLine className={isAuthed ? GUEST_HEADER_LOGO_CLASS : PUBLIC_NAV_LOGO_CLASS} />
        </Link>

        {isAuthed ? (
          <Link
            href="/"
            aria-label="Hillside Hidden Resort home"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap lg:hidden"
          >
            <span className="text-[1.15rem] font-semibold leading-none tracking-[0.01em] text-[#0E1F33] min-[400px]:text-[1.25rem]">
              Hillside Hidden <span className="font-medium text-[#22A699]">Resort</span>
            </span>
          </Link>
        ) : null}

        {isAuthed ? <PrimaryNavTabs /> : null}

        <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-[var(--color-text)] max-lg:ml-auto sm:gap-1.5 sm:text-sm">
          {isAdmin ? (
            <Link
              href="/admin"
              className="hidden items-center gap-1.5 rounded-full px-3.5 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:inline-flex"
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin
            </Link>
          ) : null}

          {isAuthed ? (
            <>
              <NotificationBell />
              <span className="hidden md:inline-flex">
                <ProfilePill initialName={initialName} />
              </span>
            </>
          ) : (
            <>
              <Link
                href="/stays"
                className="hidden rounded-full px-3.5 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:inline-flex"
              >
                Browse stays
              </Link>
              <Link
                href="/login"
                className="rounded-full px-2 py-1.5 text-[12px] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:px-3.5 sm:py-2 sm:text-sm"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-[var(--color-primary)] px-2.5 py-1.5 text-[12px] text-white transition hover:brightness-110 sm:px-4 sm:py-2 sm:text-sm"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
