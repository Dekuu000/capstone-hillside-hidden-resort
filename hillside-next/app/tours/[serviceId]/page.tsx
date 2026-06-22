import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, MapPin, Users } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { fetchPublicServiceById, tourGalleryImages, tourSchedule } from "../../../lib/catalog";
import { SiteFooter } from "../../../components/booking/SiteFooter";
import { ListingGallery } from "../../../components/booking/ListingGallery";
import { MapPlaceholder } from "../../../components/booking/MapPlaceholder";
import { TourBookingCard } from "../../../components/booking/TourBookingCard";

export default async function TourDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const service = await fetchPublicServiceById(serviceId);
  if (!service) notFound();

  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const gallery = tourGalleryImages();
  const schedule = tourSchedule(service);

  return (
    <main className={`flex min-h-screen flex-col bg-[var(--color-background)]${auth ? " pb-24 md:pb-0" : ""}`}>

      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-6 lg:px-8">
        <Link
          href="/tours"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold muted-text transition hover:text-[var(--color-text)]"
        >
          <ChevronLeft className="h-4 w-4" />
          All tours
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{service.service_name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm muted-text">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {schedule}
          </span>
          {service.max_pax ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                Up to {service.max_pax} guests
              </span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            Olongapo, Zambales
          </span>
        </div>

        <div className="mt-5">
          <ListingGallery images={gallery} alt={service.service_name} />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">About this tour</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">
                {service.description || "A guided Hillside experience. Choose your date and group size to reserve."}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Good to know</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-text)]">
                <li>• Reserve with a small GCash deposit; the balance is settled at the resort.</li>
                <li>• Your booking is confirmed once our team verifies your payment.</li>
                <li>• Bring a valid ID and arrive at the tour meet-up point on your visit date.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Where you&apos;ll meet</h2>
              <div className="mt-3">
                <MapPlaceholder className="h-64" />
              </div>
              <p className="mt-2 text-sm muted-text">Prk. 7, Jupiter St, Olongapo City, Zambales</p>
            </section>
          </div>

          <aside>
            <div className="lg:sticky lg:top-24">
              <TourBookingCard service={service} isAuthed={Boolean(auth)} />
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
