import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { HillsideLogo } from "../branding/HillsideLogo";
import { PrimaryNavTabs } from "../guest/PrimaryNavTabs";
import { ProfilePill } from "../guest/ProfilePill";

type SearchNavProps = {
  isAuthed?: boolean;
  isAdmin?: boolean;
};

/** Sticky top bar for the public funnel — matches the logged-in guest header. */
export function SearchNav({ isAuthed = false, isAdmin = false }: SearchNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex h-[70px] w-full max-w-[1440px] items-center justify-between gap-3 px-4 md:h-20 md:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center" aria-label="Hillside Hidden Resort home">
          <HillsideLogo compact className="[&_svg]:h-9 [&_svg]:w-9 min-[390px]:[&_svg]:h-10 min-[390px]:[&_svg]:w-10 [&_p:first-of-type]:text-[1rem] [&_p:first-of-type]:font-semibold min-[410px]:[&_p:first-of-type]:text-[1.2rem] min-[480px]:[&_p:first-of-type]:text-[1.35rem] [&_p:last-child]:text-[0.62rem] [&_p:last-child]:tracking-[0.30em] md:[&_svg]:h-11 md:[&_svg]:w-11 md:[&_p:first-of-type]:text-[1.6rem] md:[&_p:last-child]:text-[0.68rem]" />
        </Link>

        {isAuthed ? <PrimaryNavTabs /> : null}

        <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-[var(--color-text)] sm:gap-1.5 sm:text-sm">
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
            <ProfilePill />
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
                className="rounded-full px-2.5 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] sm:px-3.5"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-[var(--color-primary)] px-3 py-2 text-white transition hover:brightness-110 sm:px-4"
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
