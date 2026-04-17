export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <h1 className="text-3xl text-[var(--color-text)]">Terms of Service</h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          By using Hillside Hidden Resort services, you agree to provide accurate booking details,
          respect payment and check-in rules, and comply with resort policies.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted)]">
          <li>Reservations are subject to availability and verification.</li>
          <li>Payments are validated through official resort workflows.</li>
          <li>Misuse of QR and account credentials may result in account restrictions.</li>
        </ul>
      </section>
    </main>
  );
}
