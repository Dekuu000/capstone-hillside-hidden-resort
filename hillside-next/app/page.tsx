import Link from "next/link";
import { CalendarCheck, QrCode, ShieldCheck } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../lib/serverAuth";
import { fetchPublicUnits, fetchPublicServices } from "../lib/catalog";
import { SearchWidget } from "../components/booking/SearchWidget";
import { HomeListings } from "../components/booking/HomeListings";
import { TourCard } from "../components/booking/TourCard";
import { SiteFooter } from "../components/booking/SiteFooter";

// Real photo of the Hillside Hidden Resort entrance (served from public/).
const HERO_IMAGE = "/branding/hero-hillside.png";

const HOW_IT_WORKS = [
  {
    icon: CalendarCheck,
    title: "Book in minutes",
    desc: "Browse real availability, pick your dates, and reserve your spot in the hills.",
  },
  {
    icon: ShieldCheck,
    title: "Pay & get verified",
    desc: "Send your GCash deposit and upload proof — our team confirms it quickly.",
  },
  {
    icon: QrCode,
    title: "Skip the front desk",
    desc: "Arrive with your QR pass and check in seamlessly. Relax, you've earned it.",
  },
];

export default async function HomePage() {
  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const [units, services] = await Promise.all([fetchPublicUnits({ limit: 60 }), fetchPublicServices()]);

  return (
    <main className={`flex min-h-screen flex-col bg-[var(--color-background)]${auth ? " pb-24 md:pb-0" : ""}`}>

      {/* Hero */}
      <section className="relative bg-[#0e2740]">
        {/* Desktop/tablet: full-bleed photo behind overlaid text. */}
        <div
          className="absolute inset-0 hidden bg-cover bg-top md:block"
          style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          aria-hidden
        />
        <div className="absolute inset-0 hidden bg-gradient-to-b from-black/45 via-black/30 to-black/55 md:block" aria-hidden />

        {/* Mobile: the full signage as a banner (a portrait hero would crop the
            wide sign), with its base fading into the brand navy so the photo and
            the headline below read as one continuous hero — not two stacked boxes. */}
        <div className="relative md:hidden">
          <div
            className="aspect-[11/5] w-full bg-cover bg-top"
            style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#0e2740]" aria-hidden />
        </div>

        <div className="relative mx-auto w-full max-w-[1280px] px-4 pb-28 pt-4 md:px-6 md:pb-32 md:pt-28 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">Your hidden escape awaits</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-white md:text-6xl">
            Stay where the hills meet stillness.
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85 md:text-lg">
            Cozy rooms, private cottages, and event spaces at Hillside Hidden Resort — book securely,
            check in by QR, and unwind.
          </p>
        </div>
      </section>

      {/* Search widget overlapping the hero (relative+z to paint above the positioned hero) */}
      <div className="relative z-10 mx-auto -mt-16 w-full max-w-[1080px] px-4 md:-mt-14 md:px-6 lg:px-8">
        <SearchWidget />
      </div>

      <HomeListings units={units} />

      {/* Day passes & tours */}
      {services.length > 0 ? (
        <section className="mx-auto w-full max-w-[1280px] px-4 pb-4 md:px-6 lg:px-8">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Day passes &amp; tours</h2>
              <p className="muted-text text-sm">Guided experiences and day visits — no overnight stay required.</p>
            </div>
            {services.length > 4 ? (
              <Link href="/tours" className="shrink-0 text-sm font-semibold text-[var(--color-secondary)] hover:underline">
                See all
              </Link>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.slice(0, 4).map((service) => (
              <TourCard key={service.service_id} service={service} />
            ))}
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-12 md:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-semibold text-[var(--color-text)]">{title}</h3>
                  <p className="mt-1 text-sm muted-text">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
