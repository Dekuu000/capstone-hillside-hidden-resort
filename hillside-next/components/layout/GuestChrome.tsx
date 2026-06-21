"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { GUEST_HEADER_LOGO_CLASS, HillsideLogo } from "../branding/HillsideLogo";
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
        <div className="mx-auto flex h-[70px] w-full max-w-[430px] items-center justify-center px-4 md:h-20 md:max-w-[1440px] md:justify-between md:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center">
            <HillsideLogo oneLine className={GUEST_HEADER_LOGO_CLASS} />
          </Link>

          <PrimaryNavTabs />

          <span className="hidden md:inline-flex">
            <ProfilePill initialName={initialName} />
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <GuestBottomNav />
    </div>
  );
}
