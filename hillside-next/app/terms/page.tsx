import Link from "next/link";
import { TermsContent, CancellationContent } from "../../components/legal/legalContent";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[var(--color-secondary)]">Guest policy</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-primary)]">Terms &amp; Conditions</h1>

        <div className="mt-6">
          <TermsContent />
        </div>

        <h2 className="mt-8 text-xl font-bold tracking-tight text-[var(--color-primary)]">
          Cancellation &amp; Refunds
        </h2>
        <div className="mt-3">
          <CancellationContent />
        </div>

        <p className="mt-6 text-sm text-[var(--color-muted)]">
          See also our{" "}
          <Link href="/privacy" className="font-semibold text-[var(--color-secondary)] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 text-sm font-bold text-white transition hover:brightness-110"
          >
            Back to sign up
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-5 text-sm font-bold text-[var(--color-primary)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          >
            Sign in instead
          </Link>
        </div>
      </section>
    </main>
  );
}
