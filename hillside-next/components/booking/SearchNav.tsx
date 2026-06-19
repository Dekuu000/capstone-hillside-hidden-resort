import Link from "next/link";
import { CircleUserRound, LayoutDashboard } from "lucide-react";
import { HillsideLogo } from "../branding/HillsideLogo";

type SearchNavProps = {
  isAuthed?: boolean;
  isAdmin?: boolean;
};

/** Sticky, Airbnb-style top bar for the public browse + booking funnel. */
export function SearchNav({ isAuthed = false, isAdmin = false }: SearchNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center" aria-label="Hillside Hidden Resort home">
          {/* Show the wordmark on every size (smaller on mobile), matching the guest header. */}
          <HillsideLogo compact className="[&_img]:h-9 [&_img]:w-9 min-[390px]:[&_img]:h-10 min-[390px]:[&_img]:w-10 [&_p:first-of-type]:text-[1.2rem] [&_p:first-of-type]:font-semibold min-[390px]:[&_p:first-of-type]:text-[1.3rem] [&_p:last-child]:text-[0.62rem] [&_p:last-child]:tracking-[0.30em] md:[&_img]:h-11 md:[&_img]:w-11 md:[&_p:first-of-type]:text-[1.6rem] md:[&_p:last-child]:text-[0.68rem]" />
        </Link>

        <nav className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[var(--color-text)]">
          <Link
            href="/stays"
            className="hidden rounded-full px-3.5 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:inline-flex"
          >
            Browse stays
          </Link>

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
            // On mobile the persistent bottom tab bar covers Trips/Profile, so hide this.
            <Link
              href="/guest/account"
              aria-label="Profile and account"
              className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] py-2 pl-3 pr-2 transition hover:shadow-[var(--shadow-sm)] sm:inline-flex"
            >
              <span>Profile</span>
              <CircleUserRound className="h-6 w-6 text-[var(--color-muted)]" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3.5 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-white transition hover:brightness-110"
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
