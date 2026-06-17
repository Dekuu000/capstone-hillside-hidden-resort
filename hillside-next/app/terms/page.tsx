import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[var(--color-secondary)]">Guest policy</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-primary)]">Terms of Service</h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          By using Hillside Hidden Resort services, you agree to provide accurate booking details,
          respect payment and check-in rules, and comply with resort policies.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted)]">
          <li>Reservations are subject to availability and verification.</li>
          <li>Payments are validated through official resort workflows.</li>
          <li>Misuse of QR and account credentials may result in account restrictions.</li>
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/sign-up"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 text-sm font-bold text-white transition hover:brightness-110"
          >
            Back to sign up
          </Link>
          <Link
            href="/auth/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-5 text-sm font-bold text-[var(--color-primary)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          >
            Sign in instead
          </Link>
        </div>
      </section>
    </main>
  );
}
