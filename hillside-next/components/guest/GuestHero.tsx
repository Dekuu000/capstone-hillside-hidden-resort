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
        "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-sm",
        dark
          ? "border-slate-700/40 bg-[linear-gradient(122deg,#113761_0%,#08284f_38%,#052247_100%)] text-white"
          : "text-[var(--color-text)]",
        className,
      )}
    >
      {dark ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(128deg,#123b68_0%,#0a2f5b_42%,#08254f_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_86%,rgba(35,73,131,0.5),transparent_46%),radial-gradient(circle_at_88%_18%,rgba(10,24,53,0.54),transparent_52%)]" />
          <div className="pointer-events-none absolute right-4 top-8 h-40 w-40 opacity-[0.1] md:hidden bg-[url('/branding/palm-leaf-shadow.svg')] bg-contain bg-no-repeat" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[url('/branding/guest-hero-guest-portal.jpg')] bg-cover bg-center opacity-[0.8]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.93)_38%,rgba(255,255,255,0.62)_66%,rgba(255,255,255,0.18)_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-white/58 via-transparent to-white/26" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_34%,rgba(14,165,164,0.06),transparent_30%),radial-gradient(circle_at_86%_68%,rgba(11,31,59,0.06),transparent_38%)]" />
          </div>
        </>
      )}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-4 p-5",
          dark
            ? "sm:p-5 lg:flex-row lg:items-start lg:justify-between lg:p-8"
            : "lg:grid lg:min-h-[168px] lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-5 lg:p-6",
          contentClassName,
        )}
      >
        <div className={cn("min-w-0", dark ? "max-w-[46rem]" : "max-w-[44rem]")}>
          {eyebrow ? (
            <p className={cn("text-xs font-bold uppercase tracking-[0.35em]", dark ? "text-teal-300" : "text-[var(--color-secondary)]")}>{eyebrow}</p>
          ) : null}
          <h1
            className={cn(
              "mt-3 font-semibold tracking-tight",
              dark
                ? "font-serif text-[38px] leading-none text-white min-[390px]:text-[40px]"
                : "font-serif text-[36px] leading-none text-[var(--color-primary)] min-[390px]:text-[40px] lg:text-[52px]",
            )}
          >
            {title}
          </h1>
          <span className={cn("mt-4 block h-1 w-16 rounded-full", dark ? "bg-teal-300" : "bg-[var(--color-secondary)]")} />
          {subtitle ? (
            <p
              className={cn(
                "mt-6 leading-tight",
                dark ? "text-base text-white/75" : "text-xl font-normal tracking-tight text-slate-800 lg:text-2xl",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          {detail ? (
            <p className={cn("mt-2 text-sm sm:text-sm", dark ? "font-semibold text-white" : "font-semibold text-slate-600")}>
              {detail}
            </p>
          ) : null}
        </div>
        {rightSlot ? (
          <div className={cn("w-full", dark ? "mt-1 lg:mt-0 lg:w-[23rem]" : "max-w-sm lg:w-[380px] lg:justify-self-end")}>{rightSlot}</div>
        ) : null}
      </div>
    </header>
  );
}
