import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Leaf,
  Palmtree,
  QrCode,
  ShieldCheck,
  Star,
  WalletCards,
} from "lucide-react";
import { getServerAccessToken, getServerAuthContext } from "../lib/serverAuth";
import { HillsideLogo } from "../components/branding/HillsideLogo";
import { GuestStoriesCarousel } from "../components/landing/GuestStoriesCarousel";

const accommodations = [
  {
    title: "Hillside Villa",
    tier: "Premium",
    caption: "Spacious villa with panoramic views",
    guests: "2-4 guests",
    price: "From P4,500 / night",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Garden View Room",
    tier: "Deluxe",
    caption: "Peaceful stay surrounded by nature",
    guests: "2 guests",
    price: "From P3,200 / night",
    image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Poolside Room",
    tier: "Standard",
    caption: "Easy access to pool and amenities",
    guests: "2 guests",
    price: "From P2,500 / night",
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80",
  },
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Secure Payments",
    subtitle: "Protected and encrypted transactions",
  },
  {
    icon: QrCode,
    title: "QR Check-In",
    subtitle: "Skip the front desk, start relaxing faster",
  },
  {
    icon: Star,
    title: "4.8 Guest Rating",
    subtitle: "Loved by travelers like you",
  },
  {
    icon: Leaf,
    title: "Smart & Reliable",
    subtitle: "AI-powered service you can count on",
  },
];

const flowItems = [
  {
    step: "1",
    title: "Book Online",
    desc: "Choose your dates and accommodation",
    icon: CalendarDays,
  },
  {
    step: "2",
    title: "Pay & Verify",
    desc: "Secure payment and quick verification",
    icon: CreditCard,
  },
  {
    step: "3",
    title: "Get QR Ready",
    desc: "Receive your QR code for easy check-in",
    icon: QrCode,
  },
  {
    step: "4",
    title: "Enjoy & Relax",
    desc: "Arrive and enjoy your perfect stay",
    icon: Palmtree,
  },
];

export default async function HomePage() {
  const accessToken = await getServerAccessToken();
  if (accessToken) {
    const auth = await getServerAuthContext(accessToken);
    if (auth?.role === "admin") {
      redirect("/admin/reservations");
    }
    if (auth) {
      redirect("/my-bookings");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fbff]">
      <section className="relative bg-[var(--color-primary)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=2200&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(6,18,37,0.88)_0%,rgba(6,18,37,0.68)_36%,rgba(6,18,37,0.42)_62%,rgba(6,18,37,0.56)_100%)]" />

        <div className="relative mx-auto w-full max-w-[1300px] px-5 pb-24 pt-7 sm:px-7 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 px-1 py-2">
            <HillsideLogo light />
            <nav className="hidden items-center gap-6 text-sm font-medium text-white/92 lg:flex">
              <a href="#home" className="text-teal-300">
                Home
              </a>
              <a href="#accommodations" className="hover:text-white">
                Accommodations
              </a>
              <a href="#amenities" className="hover:text-white">
                Amenities
              </a>
              <a href="#about" className="hover:text-white">
                About
              </a>
              <a href="#contact" className="hover:text-white">
                Contact
              </a>
              <Link href="/auth/sign-in?next=/my-bookings" className="hover:text-white">
                Check Reservation
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                href="/auth/sign-in"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/35 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sign In
              </Link>
              <Link
                href="/book"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-cta)] bg-[var(--color-cta)] px-4 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Book a Stay
              </Link>
            </div>
          </header>

          <div id="home" className="mt-14 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-300">
              Your escape awaits
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-white sm:text-6xl">
              Relax. Recharge.
              <br />
              <span className="text-teal-300">Stay with Trust.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/88">
              Experience hillside tranquility, warm Filipino hospitality, and modern convenience.
              Book securely, check in seamlessly, and enjoy a stay you will never forget.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/book"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--color-cta)] bg-[var(--color-cta)] px-6 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Book a Stay
              </Link>
              <a
                href="#accommodations"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/35 bg-white/5 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Accommodations
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-20 -mt-12">
        <div className="mx-auto w-full max-w-[1300px] px-5 sm:px-7 lg:px-10">
          <div className="mx-auto grid w-full max-w-[1120px] rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-md)] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[var(--color-border)]">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex min-h-[96px] items-center px-6 py-4 lg:px-7">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-secondary)]" />
                    <div>
                      <p className="text-[1rem] font-semibold leading-tight text-[var(--color-text)]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[0.92rem] leading-tight text-[var(--color-muted)]">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section
        id="accommodations"
        className="mx-auto w-full max-w-[1300px] px-5 pb-6 pt-16 sm:px-7 lg:px-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-secondary)]">
              Stay your way
            </p>
            <h2 className="mt-2 text-4xl font-semibold text-[var(--color-text)]">
              Find Your Perfect Stay
            </h2>
            <p className="mt-2 text-[var(--color-muted)]">
              Comfort meets nature. Choose from our handpicked accommodations.
            </p>
          </div>
          <Link href="/book" className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
            View All Accommodations
          </Link>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {accommodations.map((item) => (
            <article
              key={item.title}
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-md)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt={item.title} className="h-52 w-full object-cover" loading="lazy" />
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-secondary)]">
                  {item.tier}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{item.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{item.caption}</p>
                <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-muted)]">
                  <span>{item.guests}</span>
                  <span className="font-semibold text-[var(--color-primary)]">{item.price}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="amenities"
        className="mx-auto grid w-full max-w-[1300px] gap-6 px-5 pb-10 pt-6 lg:grid-cols-[0.44fr_0.56fr] lg:items-center sm:px-7 lg:px-10"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-secondary)]">
            Why book with Hillside?
          </p>
          <h2 className="mt-2 text-4xl font-semibold text-[var(--color-text)]">
            More Than a Stay.
            <br />
            <span className="text-[var(--color-secondary)]">It&apos;s an Experience.</span>
          </h2>
          <p className="mt-3 text-[var(--color-muted)]">
            We blend natural beauty with modern technology so your trip stays seamless from booking to check-in.
          </p>
          <ul className="mt-6 space-y-3">
            <li className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--color-secondary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Seamless Booking</p>
                <p className="text-sm text-[var(--color-muted)]">
                  Fast reservation and instant status updates.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <WalletCards className="mt-0.5 h-5 w-5 text-[var(--color-secondary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Hassle-Free Payment</p>
                <p className="text-sm text-[var(--color-muted)]">
                  Verified payment tracking with clear progress.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--color-secondary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Trusted & Transparent</p>
                <p className="text-sm text-[var(--color-muted)]">Secure operations and audit-ready records.</p>
              </div>
            </li>
          </ul>
        </div>
        <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-md)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1800&q=80"
            alt="Balcony view at Hillside Hidden Resort"
            className="h-[420px] w-full object-cover"
            loading="lazy"
          />
        </div>
      </section>

      <section id="about" className="bg-[#f5f8fc] pb-6 pt-14">
        <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-7">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-secondary)]">
            Easy & Fast
          </p>
          <h2 className="mt-2 text-center text-4xl font-semibold text-[var(--color-text)]">How It Works</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {flowItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.step} className="relative px-3 text-center">
                  <p className="mx-auto mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-white">
                    {item.step}
                  </p>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                    <Icon className="h-7 w-7 text-[var(--color-secondary)]" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-[var(--color-text)]">{item.title}</h3>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{item.desc}</p>
                  {item.step !== "4" ? (
                    <span className="pointer-events-none absolute right-[-10%] top-[42px] hidden h-px w-[20%] bg-[var(--color-border)] md:block" />
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="w-full pt-0">
        <div className="grid w-full overflow-hidden lg:grid-cols-[1.05fr_1.2fr_0.95fr_1fr]">
          <GuestStoriesCarousel />

          <article className="overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1615880484746-a134be9a6ecf?auto=format&fit=crop&w=1400&q=80"
              alt="Twilight resort pool view"
              className="h-full min-h-[320px] w-full object-cover"
              loading="lazy"
            />
          </article>

          <article className="bg-[#d7f5ef] p-8">
            <p className="text-[var(--color-secondary)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2c-3.9 0-7 3.2-7 7.1 0 5.3 7 12.9 7 12.9s7-7.6 7-12.9C19 5.2 15.9 2 12 2Zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5Z" />
              </svg>
            </p>
            <h3 className="mt-4 text-3xl font-semibold text-[var(--color-primary)]">Visit Us</h3>
            <p className="mt-4 text-base text-[var(--color-text)]">Brgy. Latag, Orani, Bataan</p>
            <p className="text-base text-[var(--color-text)]">Philippines 2112</p>
            <a
              href="https://maps.google.com/?q=Orani+Bataan"
              className="mt-8 inline-flex text-sm font-semibold text-[var(--color-secondary)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Get Directions
            </a>
          </article>

          <article className="relative overflow-hidden bg-[#eff6fb]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/resort-map.svg" alt="Hillside resort location map" className="h-full min-h-[320px] w-full object-cover" loading="lazy" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full border border-[var(--color-secondary)] bg-white/90 px-3 py-1 text-xs font-semibold text-[var(--color-primary)] shadow-[var(--shadow-sm)]">
                Hillside Hidden Resort
              </span>
            </div>
          </article>
        </div>
      </section>

      <footer className="w-full pb-0">
        <div
          className="relative w-full overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(110deg,rgba(7,23,43,.92),rgba(9,30,54,.88)),url('https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1800&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="grid gap-7 p-8 text-white lg:grid-cols-[1fr_1.2fr_auto] lg:items-center">
            <div>
              <HillsideLogo light />
              <p className="mt-4 text-sm text-white/75">
                Your trusted getaway in Bataan. Relax, recharge, and stay with trust.
              </p>
            </div>
            <div>
              <h3 className="text-4xl font-semibold">Ready for Your Escape?</h3>
              <p className="mt-2 text-base text-white/80">
                Book today and experience the perfect blend of nature, comfort, and modern hospitality.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/book"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-cta)] bg-[var(--color-cta)] px-5 text-sm font-semibold text-white hover:brightness-95"
              >
                Book a Stay
              </Link>
              <Link
                href="/auth/sign-in"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/35 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Sign In
              </Link>
            </div>
          </div>

          <div className="border-t border-white/15 px-8 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-white/70">
              <p>&copy; 2026 Hillside Hidden Resort. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <Link href="/about-us" className="hover:text-white">
                  About Us
                </Link>
                <Link href="/contact-us" className="hover:text-white">
                  Contact
                </Link>
                <Link href="/privacy" className="hover:text-white">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="hover:text-white">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
