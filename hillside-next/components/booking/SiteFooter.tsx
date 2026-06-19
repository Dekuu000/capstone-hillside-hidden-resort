import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <div className="space-y-1">
          <p className="font-semibold text-[var(--color-text)]">Hillside Hidden Resort</p>
          <p className="muted-text">Prk. 7, Jupiter St, Olongapo City, Zambales</p>
        </div>
        <nav className="flex flex-wrap items-center gap-4 muted-text">
          <Link href="/stays" className="hover:text-[var(--color-text)]">
            Browse stays
          </Link>
          <Link href="/privacy" className="hover:text-[var(--color-text)]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-[var(--color-text)]">
            Terms of Service
          </Link>
          <span>© 2026 Hillside Hidden Resort</span>
        </nav>
      </div>
    </footer>
  );
}
