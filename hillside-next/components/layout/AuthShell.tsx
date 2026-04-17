import type { ReactNode } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { HillsideLogo } from "../branding/HillsideLogo";

type AuthShellProps = {
  showSidePanel?: boolean;
  showSideHighlight?: boolean;
  sideTitle: string;
  sideSubtitle: string;
  sideDescription: string;
  sideProof?: string;
  sideImageUrl?: string;
  sideQuote?: string;
  sideCaption?: string;
  mobileBrandLine?: string;
  formIntro: string;
  formTitle: string;
  formSubtitle: string;
  children: ReactNode;
};

export function AuthShell({
  showSidePanel = true,
  showSideHighlight = true,
  sideTitle,
  sideSubtitle,
  sideDescription,
  sideProof,
  sideImageUrl,
  sideQuote,
  sideCaption,
  mobileBrandLine,
  formIntro,
  formTitle,
  formSubtitle,
  children,
}: AuthShellProps) {
  const imageSrc =
    sideImageUrl ||
    "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=1400&q=80";

  return (
    <main className="min-h-screen bg-[#e8edf3] px-4 py-6 sm:px-6 lg:px-8">
      <div
        className={`mx-auto w-full overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] ${
          showSidePanel ? "grid max-w-[1340px] lg:min-h-[840px] lg:grid-cols-[0.46fr_0.54fr]" : "max-w-xl"
        }`}
      >
        {showSidePanel ? (
          <div className="border-b border-white/20 bg-[var(--color-primary)] px-5 py-4 text-white lg:hidden">
            <HillsideLogo light compact />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{mobileBrandLine || sideTitle}</p>
          </div>
        ) : null}

        {showSidePanel ? (
          <aside className="relative hidden lg:flex lg:flex-col">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${imageSrc}')` }} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,22,43,0.52),rgba(7,20,38,0.84))]" />
            <div className="relative flex h-full flex-col p-10 text-white">
              <HillsideLogo light />
              <div className="mt-auto">
                <h1 className="text-[2.6rem] font-semibold leading-[1.05]">{sideTitle}</h1>
                <p className="mt-2 text-[2rem] font-semibold text-teal-300">{sideSubtitle}</p>
                <p className="mt-4 max-w-sm text-base leading-relaxed text-white/90">{sideDescription}</p>

                {showSideHighlight ? (
                  <div className="mt-10 space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-full border border-white/25 bg-white/10 p-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.7" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Secure & Trusted</p>
                        <p className="text-sm text-white/75">Your account is protected</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-full border border-white/25 bg-white/10 p-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M8 3h8v4H8zM4 9h4v4H4zM16 9h4v4h-4zM8 15h8v6H8z" stroke="currentColor" strokeWidth="1.7" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold">QR Check-In Ready</p>
                        <p className="text-sm text-white/75">Skip the front desk line</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-full border border-white/25 bg-white/10 p-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 8a8 8 0 0 1 16 0M7 11a5 5 0 0 1 10 0M10.5 14a1.5 1.5 0 0 1 3 0M12 18h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Works Offline</p>
                        <p className="text-sm text-white/75">Access bookings anywhere</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              {sideQuote ? (
                <blockquote className="mt-8 rounded-2xl border border-white/18 bg-black/25 p-4 text-sm text-white/90">
                  <p>{sideQuote}</p>
                  {sideCaption ? <cite className="mt-2 block text-xs not-italic text-white/70">{sideCaption}</cite> : null}
                </blockquote>
              ) : null}
            </div>
          </aside>
        ) : null}

        <section className={showSidePanel ? "flex min-h-full flex-col bg-[#f9fbfe]" : "p-6 sm:p-8 md:p-10"}>
          {showSidePanel ? (
            <div className="flex items-center justify-end px-6 pt-6 sm:px-10">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)]"
              >
                <Globe className="h-4 w-4" />
                EN
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null}

          <div className={showSidePanel ? "mx-auto my-auto w-full max-w-[520px] px-6 py-8 sm:px-10" : ""}>
            <div className={showSidePanel ? "rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-md)] sm:p-8" : ""}>
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted)]">{formIntro}</p>
                <h2 className="mt-2 text-4xl leading-tight text-[var(--color-text)]">{formTitle}</h2>
                <p className="mt-2 text-base text-[var(--color-muted)]">{formSubtitle}</p>
              </div>
              {children}
              {sideProof ? (
                <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-emerald-800">Secure Resort Experience</p>
                  <p className="mt-1 text-emerald-700">{sideProof}</p>
                </div>
              ) : null}
            </div>
          </div>

          {showSidePanel ? (
            <div className="border-t border-[var(--color-border)] px-6 py-4 text-center text-xs text-[var(--color-muted)] sm:px-10">
              <span>&copy; 2026 Hillside Hidden Resort</span>
              <span className="mx-2">·</span>
              <Link href="/privacy" className="hover:text-[var(--color-primary)] hover:underline">
                Privacy Policy
              </Link>
              <span className="mx-2">·</span>
              <Link href="/terms" className="hover:text-[var(--color-primary)] hover:underline">
                Terms of Service
              </Link>
            </div>
          ) : null}

          {!showSidePanel ? (
            <div className="mt-8 border-t border-[var(--color-border)] pt-4 text-center text-xs text-[var(--color-muted)]">
              <span>&copy; 2026 Hillside Hidden Resort</span>
            </div>
          ) : null}

        </section>
      </div>
    </main>
  );
}
