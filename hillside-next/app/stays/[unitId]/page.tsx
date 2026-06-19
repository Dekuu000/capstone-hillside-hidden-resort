import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Star, Users } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { fetchPublicUnitById, unitGalleryImages, unitTypeLabel } from "../../../lib/catalog";
import { SearchNav } from "../../../components/booking/SearchNav";
import { SiteFooter } from "../../../components/booking/SiteFooter";
import { ListingGallery } from "../../../components/booking/ListingGallery";
import { AmenityList } from "../../../components/booking/AmenityList";
import { ListingBookingCard } from "../../../components/booking/ListingBookingCard";
import { MapPlaceholder } from "../../../components/booking/MapPlaceholder";
import { isBackOffice } from "../../../../packages/shared/src/types";

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
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const gallery = unitGalleryImages(unit);
  const amenities = unit.amenities ?? [];

  return (
    <main className="min-h-screen bg-[var(--color-background)]">
      <SearchNav isAuthed={Boolean(auth)} isAdmin={isBackOffice(auth?.role)} />

      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-6 lg:px-8">
        <Link
          href="/stays"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold muted-text transition hover:text-[var(--color-text)]"
        >
          <ChevronLeft className="h-4 w-4" />
          All stays
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{unit.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm muted-text">
          <span className="inline-flex items-center gap-1 text-[var(--color-text)]">
            <Star className="h-4 w-4 fill-[var(--color-cta)] text-[var(--color-cta)]" />
            4.9
          </span>
          <span aria-hidden>·</span>
          <span>{unitTypeLabel(unit.type)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4" />
            Up to {unit.capacity} guests
          </span>
          <span aria-hidden>·</span>
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
              <p className="mt-2 text-sm muted-text">Reviews from verified stays will appear here.</p>
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
