import Link from "next/link";
import { CalendarCheck, QrCode, ShieldCheck } from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../lib/serverAuth";
import { fetchPublicUnits, fetchPublicServices } from "../lib/catalog";
import { SearchNav } from "../components/booking/SearchNav";
import { isBackOffice } from "../../packages/shared/src/types";
import { SearchWidget } from "../components/booking/SearchWidget";
import { HomeListings } from "../components/booking/HomeListings";
import { TourCard } from "../components/booking/TourCard";
import { SiteFooter } from "../components/booking/SiteFooter";
import { GuestBottomNav } from "../components/guest/GuestBottomNav";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=2000&q=80";

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
      <SearchNav isAuthed={Boolean(auth)} isAdmin={isBackOffice(auth?.role)} />

      {/* Hero */}
      <section className="relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/55" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1280px] px-4 pb-28 pt-20 md:px-6 md:pb-32 md:pt-28 lg:px-8">
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
            <Link href="/tours" className="shrink-0 text-sm font-semibold text-[var(--color-secondary)] hover:underline">
              See all
            </Link>
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
      {auth ? <GuestBottomNav /> : null}
    </main>
  );
}
