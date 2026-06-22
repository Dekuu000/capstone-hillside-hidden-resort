import type { ReactNode } from "react";
import { SiteFooter } from "../booking/SiteFooter";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

/**
 * Signed-in guest content shell. The header (SearchNav) and the mobile bottom nav
 * are rendered once in the root layout (GuestHeaderGate) so they stay mounted
 * across navigations — this shell just provides the content area + footer.
 */
export function GuestChrome({ children }: GuestChromeProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
