import type { ReactNode } from "react";

/**
 * Light, Airbnb-style page header for the logged-in guest area.
 * Mirrors the public Stays/Tours funnel: a clean bold title + muted subtitle
 * on the warm background, with an optional aside (e.g. a stay snapshot card).
 */
export function GuestPageIntro({
  title,
  subtitle,
  aside,
  testId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  testId?: string;
}) {
  return (
    <header
      data-testid={testId}
      className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm muted-text">{subtitle}</p> : null}
      </div>
      {aside ? <div className="w-full lg:w-[380px] lg:shrink-0">{aside}</div> : null}
    </header>
  );
}
