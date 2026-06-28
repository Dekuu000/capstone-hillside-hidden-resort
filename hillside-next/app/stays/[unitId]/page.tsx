import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Star, Users } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { fetchPublicUnitById, fetchUnitReviews, unitGalleryImages, unitTypeLabel } from "../../../lib/catalog";
import { SiteFooter } from "../../../components/booking/SiteFooter";
import { ListingGallery } from "../../../components/booking/ListingGallery";
import { AmenityList } from "../../../components/booking/AmenityList";
import { ListingBookingCard } from "../../../components/booking/ListingBookingCard";
import { MapPlaceholder } from "../../../components/booking/MapPlaceholder";

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unitId } = await params;
  const sp = (await searchParams) ?? {};
  const checkIn = typeof sp.check_in === "string" ? sp.check_in : undefined;
  const checkOut = typeof sp.check_out === "string" ? sp.check_out : undefined;
  const guestsRaw = typeof sp.guests === "string" ? Number.parseInt(sp.guests, 10) : Number.NaN;
  const guests = Number.isFinite(guestsRaw) && guestsRaw > 0 ? guestsRaw : undefined;

  const unit = await fetchPublicUnitById(unitId);
  if (!unit) notFound();

  const accessToken = await getServerAccessToken();
  const [auth, reviews] = await Promise.all([
    accessToken ? getServerAuthContext(accessToken) : Promise.resolve(null),
    fetchUnitReviews(unitId),
  ]);
  const gallery = unitGalleryImages(unit);
  const amenities = unit.amenities ?? [];
  const hasReviews = reviews.summary.review_count > 0;

  return (
    <main className={`flex min-h-screen flex-col bg-[var(--color-background)]${auth ? " pb-24 md:pb-0" : ""}`}>

      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-6 lg:px-8">
        <Link
          href="/stays"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold muted-text transition hover:text-[var(--color-text)]"
        >
          <ChevronLeft className="h-4 w-4" />
          All stays
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{unit.name}</h1>
        <div className="mt-1 flex items-center gap-x-2.5 overflow-x-auto whitespace-nowrap text-sm font-medium text-[var(--color-text)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {hasReviews ? (
            <span className="inline-flex items-center gap-1 text-[var(--color-text)]">
              <Star className="h-4 w-4 fill-[var(--color-star)] text-[var(--color-star)]" />
              {reviews.summary.average_rating.toFixed(1)}
              <span className="muted-text">({reviews.summary.review_count})</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 text-[var(--color-border)]" />
              New
            </span>
          )}
          <span aria-hidden className="text-[var(--color-muted)]">·</span>
          <span>{unitTypeLabel(unit.type)}</span>
          <span aria-hidden className="text-[var(--color-muted)]">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4" />
            Up to {unit.capacity} guests
          </span>
          <span aria-hidden className="text-[var(--color-muted)]">·</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            Olongapo, Zambales
          </span>
        </div>

        <div className="mt-5">
          <ListingGallery images={gallery} alt={unit.name} />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            {unit.description ? (
              <section>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">About this stay</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">{unit.description}</p>
              </section>
            ) : null}

            {amenities.length ? (
              <section>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">What this place offers</h2>
                <div className="mt-3">
                  <AmenityList amenities={amenities} />
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Where you&apos;ll be</h2>
              <div className="mt-3">
                <MapPlaceholder className="h-64" />
              </div>
              <p className="mt-2 text-sm muted-text">Prk. 7, Jupiter St, Olongapo City, Zambales</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Guest reviews</h2>
              {hasReviews ? (
                <>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                    <Star className="h-4 w-4 fill-[var(--color-star)] text-[var(--color-star)]" />
                    {reviews.summary.average_rating.toFixed(1)} · {reviews.summary.review_count} review
                    {reviews.summary.review_count === 1 ? "" : "s"} from verified stays
                  </p>
                  <ul className="mt-4 space-y-3">
                    {reviews.items.map((review) => (
                      <li key={review.review_id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className={`h-3.5 w-3.5 ${n <= review.rating ? "fill-[var(--color-star)] text-[var(--color-star)]" : "fill-transparent text-[var(--color-border)]"}`}
                                aria-hidden="true"
                              />
                            ))}
                          </span>
                          <span className="text-xs muted-text">{formatReviewDate(review.created_at)}</span>
                        </div>
                        {review.comment ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">{review.comment}</p>
                        ) : null}
                        <p className="mt-2 text-xs muted-text">— {review.guest_name || "Verified guest"}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm muted-text">No reviews yet — be the first to review after your stay.</p>
              )}
            </section>
          </div>

          <aside>
            <div className="lg:sticky lg:top-24">
              <ListingBookingCard
                unit={unit}
                isAuthed={Boolean(auth)}
                initialCheckIn={checkIn}
                initialCheckOut={checkOut}
                initialGuests={guests}
              />
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
