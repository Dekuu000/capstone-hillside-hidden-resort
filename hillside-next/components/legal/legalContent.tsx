import type { ReactNode } from "react";

/**
 * Single source of truth for the legal copy, written in plain, recognizable
 * language. Reused by /terms, /privacy, and the sign-in/sign-up Terms modal so
 * the wording never drifts. The cancellation and data-privacy text mirrors how
 * the system actually behaves (GCash deposit, off-chain PII, hash-only on-chain).
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">{children}</div>
    </section>
  );
}

export function TermsContent() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        Welcome to Hillside Hidden Resort. By creating an account or booking a stay, you agree to the
        points below. We&apos;ve kept them short and clear.
      </p>
      <Section title="Your account">
        <p>
          Please use accurate details when you sign up. You&apos;re responsible for activity under your
          account, so keep your password private and let us know if something looks wrong.
        </p>
      </Section>
      <Section title="Booking and payment">
        <p>
          To hold a booking, pay the required deposit through GCash and upload a clear photo of your
          payment proof. Your booking is <strong>confirmed only after our staff verifies your payment</strong>.
        </p>
      </Section>
      <Section title="Check-in">
        <p>
          Bring your booking QR code on the day of your reservation. Check-in is allowed on your
          reservation date, and we may ask for a valid ID.
        </p>
      </Section>
      <Section title="During your stay">
        <p>
          Please respect resort rules, other guests, and staff. Any damage or misuse during your stay
          may be charged to your account.
        </p>
      </Section>
      <Section title="Fair use">
        <p>
          Don&apos;t misuse the app, QR codes, or other guests&apos; information. Abuse may lead to a
          restricted account.
        </p>
      </Section>
    </div>
  );
}

export function CancellationContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
      <p>
        <strong>If you cancel a confirmed booking,</strong> the deposit you paid (20% of your total,
        between ₱500 and ₱1,000) is non-refundable. Any amount you paid above the deposit is refunded.
      </p>
      <p>
        <strong>If the resort cancels your booking,</strong> you receive a full refund of everything you
        paid.
      </p>
      <p>
        <strong>Haven&apos;t paid yet?</strong> Unpaid reservations are automatically released about 2
        hours after booking, so the unit can free up for other guests.
      </p>
      <p>Refunds are processed back through your original payment method after our team reviews them.</p>
    </div>
  );
}

export function PrivacyContent() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        We respect your privacy and handle your data in line with the principles of the Philippine Data
        Privacy Act. Here&apos;s what that means in plain terms.
      </p>
      <Section title="What we collect">
        <p>Your name, email, phone number, booking details, and the payment proof you upload.</p>
      </Section>
      <Section title="How we use it">
        <p>
          Only to run your stay: managing bookings, verifying payments, enabling QR check-in, and
          contacting you about your reservation.
        </p>
      </Section>
      <Section title="Where it&apos;s stored">
        <p>
          Your personal information is stored securely in our database — <strong>never on the public
          blockchain</strong>. Only privacy-safe proofs (such as transaction hashes) are recorded
          on-chain so our booking records stay tamper-evident.
        </p>
      </Section>
      <Section title="What we don&apos;t do">
        <p>We don&apos;t sell your personal information or share it for advertising.</p>
      </Section>
      <Section title="Your rights">
        <p>
          You can view, update, or request deletion of your information anytime from your profile or by
          contacting resort support.
        </p>
      </Section>
    </div>
  );
}

/** Full combined document used by the agreement modal. */
export function LegalDocument() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Terms &amp; Conditions</h2>
        <TermsContent />
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Cancellation &amp; Refunds</h2>
        <CancellationContent />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Data Privacy</h2>
        <PrivacyContent />
      </div>
    </div>
  );
}
