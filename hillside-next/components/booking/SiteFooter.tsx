import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-[var(--color-text)]">Hillside Hidden Resort</p>
            <p className="text-sm muted-text">Prk. 7, Jupiter St, Olongapo City, Zambales</p>
          </div>
          <nav className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 text-sm muted-text">
            <Link href="/privacy" className="transition hover:text-[var(--color-text)]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition hover:text-[var(--color-text)]">
              Terms of Service
            </Link>
          </nav>
        </div>
        <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs muted-text">
          © 2026 Hillside Hidden Resort
        </p>
      </div>
    </footer>
  );
}
