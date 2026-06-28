import Link from "next/link";
import { XCircle } from "lucide-react";

export default async function PaymentCancelledPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <div className="mx-auto w-full max-w-[560px] px-4 py-16 text-center">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
          <XCircle className="mx-auto h-12 w-12 text-[var(--color-error)]" />
          <h1 className="mt-4 text-2xl font-semibold">Payment was not completed</h1>
          <p className="mt-2 text-sm muted-text">
            Your GCash payment was cancelled, so your reservation isn&apos;t confirmed yet. Your spot is still held for a
            short while — you can retry the payment to confirm it.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/reserve/${reservationId}/pay`}
              className="flex h-12 items-center justify-center rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95"
            >
              Retry payment
            </Link>
            <Link href="/my-bookings" className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
              Go to my trips
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
