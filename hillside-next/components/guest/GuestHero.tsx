"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function GuestHero({
  eyebrow,
  title,
  subtitle,
  detail,
  rightSlot,
  dark = false,
  testId,
  className,
  contentClassName,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  rightSlot?: ReactNode;
  dark?: boolean;
  testId?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <header
      data-testid={testId}
      className={cn(
        "relative overflow-hidden rounded-[2rem] border shadow-[var(--shadow-sm)]",
        dark
          ? "border-transparent text-white"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
        className,
      )}
    >
      {dark ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(122deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 78%, black) 100%)",
          }}
          aria-hidden
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 bg-[url('/branding/guest-hero-guest-portal.jpg')] bg-cover bg-center opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface)] via-[var(--color-surface)]/85 to-[var(--color-surface)]/20" />
        </div>
      )}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-4 p-5 md:p-6",
          dark
            ? "lg:flex-row lg:items-start lg:justify-between lg:p-8"
            : "lg:grid lg:min-h-[168px] lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-5",
          contentClassName,
        )}
      >
        <div className={cn("min-w-0", dark ? "max-w-[46rem]" : "max-w-[44rem]")}>
          {eyebrow ? (
            <p
              className={cn(
                "text-xs font-bold uppercase tracking-[0.3em]",
                dark ? "text-white/80" : "text-[var(--color-secondary)]",
              )}
            >
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "mt-3 font-semibold tracking-tight",
              dark
                ? "text-3xl leading-tight text-white md:text-4xl"
                : "text-3xl leading-tight text-[var(--color-primary)] md:text-4xl lg:text-5xl",
            )}
          >
            {title}
          </h1>
          <span
            className={cn(
              "mt-4 block h-1 w-14 rounded-full",
              dark ? "bg-white/60" : "bg-[var(--color-secondary)]",
            )}
          />
          {subtitle ? (
            <p
              className={cn(
                "mt-5 leading-snug",
                dark ? "text-base text-white/85" : "text-lg text-[var(--color-muted)] lg:text-xl",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          {detail ? (
            <p className={cn("mt-2 text-sm font-semibold", dark ? "text-white/90" : "text-[var(--color-text)]")}>
              {detail}
            </p>
          ) : null}
        </div>
        {rightSlot ? (
          <div className={cn("w-full", dark ? "mt-1 lg:mt-0 lg:w-[23rem]" : "max-w-sm lg:w-[380px] lg:justify-self-end")}>
            {rightSlot}
          </div>
        ) : null}
      </div>
    </header>
  );
}
