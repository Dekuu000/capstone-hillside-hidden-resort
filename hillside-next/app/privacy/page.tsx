export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <h1 className="text-3xl text-[var(--color-text)]">Privacy Policy</h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          We collect only required account and booking data to deliver reservation, payment, and
          check-in services. Sensitive personal data is kept off-chain and protected by platform controls.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted)]">
          <li>Account data is used for authentication and booking operations.</li>
          <li>Operational logs are retained for audit and dispute handling.</li>
          <li>You may request profile updates through your account settings.</li>
        </ul>
      </section>
    </main>
  );
}
