import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm muted-text">
          <span>© 2026 Hillside Hidden Resort</span>
          <span aria-hidden="true">·</span>
          <Link href="/privacy" className="transition hover:text-[var(--color-text)]">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="transition hover:text-[var(--color-text)]">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
