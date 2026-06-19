"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { HillsideLogo } from "../branding/HillsideLogo";
import { GuestBottomNav } from "../guest/GuestBottomNav";
import { PrimaryNavTabs } from "../guest/PrimaryNavTabs";
import { ProfilePill } from "../guest/ProfilePill";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

export function GuestChrome({ children, initialName = null }: GuestChromeProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header data-testid="guest-header" className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-[70px] w-full max-w-[430px] items-center justify-between px-4 md:h-20 md:max-w-[1440px] md:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <HillsideLogo compact className="[&_svg]:h-9 [&_svg]:w-9 min-[390px]:[&_svg]:h-10 min-[390px]:[&_svg]:w-10 [&_p:first-of-type]:text-[1.2rem] [&_p:first-of-type]:font-semibold min-[390px]:[&_p:first-of-type]:text-[1.3rem] [&_p:last-child]:text-[0.62rem] [&_p:last-child]:tracking-[0.30em] md:[&_svg]:h-11 md:[&_svg]:w-11 md:[&_p:first-of-type]:text-[1.6rem] md:[&_p:last-child]:text-[0.68rem]" />
          </Link>

          <PrimaryNavTabs />

          <ProfilePill initialName={initialName} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <GuestBottomNav />
    </div>
  );
}
