import type { ReactNode } from "react";
import { SearchNav } from "../booking/SearchNav";
import { GuestBottomNav } from "../guest/GuestBottomNav";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

/**
 * Signed-in guest shell. Uses the shared SearchNav header (same component as the
 * public funnel) so the brand/header is identical everywhere — plus the guest
 * content shell and bottom nav.
 */
export function GuestChrome({ children, initialName = null }: GuestChromeProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <SearchNav isAuthed initialName={initialName} />

      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <GuestBottomNav />
    </div>
  );
}
