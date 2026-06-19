import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../../../../lib/serverAuth";
import { fetchServerApiData } from "../../../../lib/serverApi";
import { reservationListItemSchema } from "../../../../../packages/shared/src/schemas";
import { formatPhpPeso } from "../../../../lib/formatCurrency";
import { SearchNav } from "../../../../components/booking/SearchNav";
import { SiteFooter } from "../../../../components/booking/SiteFooter";
import { isBackOffice } from "../../../../../packages/shared/src/types";

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reservationId } = await params;
  const sp = (await searchParams) ?? {};
  const queued = sp.queued === "1";

  const token = await getServerAccessToken();
  if (!token) redirect(`/login?next=/reserve/${reservationId}/confirmation`);
  const auth = await getServerAuthContext(token);
  if (!auth) redirect(`/login?next=/reserve/${reservationId}/confirmation`);

  const booking = await fetchServerApiData({
    accessToken: token,
    path: `/v2/me/bookings/${reservationId}`,
    schema: reservationListItemSchema,
  });

  const unitNames = (booking?.units ?? [])
    .map((entry) => entry?.unit?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SearchNav isAuthed isAdmin={isBackOffice(auth.role)} />

      <div className="mx-auto w-full max-w-[640px] px-4 py-12 md:px-6">
        <div className="flex flex-col items-center text-center">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              queued
                ? "bg-[color:color-mix(in_srgb,var(--color-warn)_15%,white)] text-[var(--color-warn)]"
                : "bg-[color:color-mix(in_srgb,var(--color-success)_15%,white)] text-[var(--color-success)]"
            }`}
          >
            {queued ? <Clock className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
            {queued ? "Saved offline — we'll sync it" : "Payment submitted!"}
          </h1>
          <p className="mt-2 text-sm muted-text">
            {queued
              ? "Your payment proof is queued and will be sent for verification once you're back online."
              : "Thanks! Our team will verify your GCash deposit shortly. You'll be ready for QR check-in once it's confirmed."}
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm muted-text">Booking reference</span>
            <span className="font-semibold text-[var(--color-text)]">
              {booking?.reservation_code ?? reservationId}
            </span>
          </div>
          <dl className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm">
            {unitNames ? (
              <div className="flex justify-between gap-4">
                <dt className="muted-text">Stay</dt>
                <dd className="text-right font-medium text-[var(--color-text)]">{unitNames}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="muted-text">Dates</dt>
              <dd className="text-right text-[var(--color-text)]">
                {formatDate(booking?.check_in_date)} → {formatDate(booking?.check_out_date)}
              </dd>
            </div>
            {booking?.guest_count ? (
              <div className="flex justify-between gap-4">
                <dt className="muted-text">Guests</dt>
                <dd className="text-[var(--color-text)]">{booking.guest_count}</dd>
              </div>
            ) : null}
            {booking ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="muted-text">Stay total</dt>
                  <dd className="text-[var(--color-text)]">{formatPhpPeso(Number(booking.total_amount ?? 0))}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>Verified paid</dt>
                  <dd>{formatPhpPeso(Number(booking.amount_paid_verified ?? 0))}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/my-bookings"
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[var(--color-cta)] text-sm font-semibold text-white transition hover:brightness-95"
          >
            View my trips
          </Link>
          <Link
            href="/"
            className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)]"
          >
            Back to home
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
