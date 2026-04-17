import Link from "next/link";
import { QrCode, ScanLine, TabletSmartphone } from "lucide-react";

export function GuestVerificationPanel() {
  return (
    <section className="surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Guest Verification</p>
      <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">Scan guest QR on mobile or tablet</h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Use scan-first flow for live arrivals. Code fallback remains available for manual verification.
      </p>

      <div className="mt-4 space-y-2">
        <Link
          href="/admin/check-in?mode=scan"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] px-3 text-sm font-semibold text-white"
        >
          <ScanLine className="h-4 w-4" />
          Open scanner
        </Link>
        <Link
          href="/admin/check-in?mode=code"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          <QrCode className="h-4 w-4" />
          Open code fallback
        </Link>
        <Link
          href="/admin/check-in?view=tablet&mode=scan"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          <TabletSmartphone className="h-4 w-4" />
          Tablet verification view
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Notes</p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
          <li>Scan tab is the default for front-desk flow.</li>
          <li>Queue + offline sync remain available in Check-in Console.</li>
          <li>For finance review, use Escrow and Reports pages.</li>
        </ul>
      </div>
    </section>
  );
}
