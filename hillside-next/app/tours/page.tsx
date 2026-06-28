import { TreePalm } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../../lib/serverAuth";
import { fetchPublicServices } from "../../lib/catalog";
import { SiteFooter } from "../../components/booking/SiteFooter";
import { TourCard } from "../../components/booking/TourCard";

export default async function ToursPage() {
  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const services = await fetchPublicServices();

  return (
    <main className={`flex min-h-screen flex-col bg-[var(--color-background)]${auth ? " pb-[calc(104px_+_env(safe-area-inset-bottom))] md:pb-0" : ""}`}>

      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--color-secondary)]">
            Day passes &amp; experiences
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Tours at Hillside Hidden Resort
          </h1>
          <p className="mt-1 text-sm muted-text">
            Pick an experience, choose your date, and reserve — a small deposit holds your spot.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-6 lg:px-8">
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[var(--color-border)] py-16 text-center">
            <TreePalm className="h-8 w-8 text-[var(--color-muted)]" />
            <p className="muted-text text-sm">No tours are available right now. Please check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((service, index) => (
              <TourCard key={service.service_id} service={service} priority={index < 4} />
            ))}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
