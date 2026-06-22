"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SearchNav } from "../booking/SearchNav";
import { GuestBottomNav } from "../guest/GuestBottomNav";

// Guest-facing routes that share the one persistent header. Anything else
// (/login, /register, /auth/*, /admin/*) renders without it.
const GUEST_PREFIXES = ["/stays", "/tours", "/my-bookings", "/guest", "/book", "/reserve"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isGuestRoute(pathname: string): boolean {
  return pathname === "/" || matchesPrefix(pathname, GUEST_PREFIXES);
}

/**
 * Renders the guest header AND the mobile bottom nav ONCE, in the root layout, so
 * they stay mounted across navigations between guest routes (Stays/Tours/Trips/
 * Profile) instead of re-mounting per page — which was the source of the nav
 * flicker on both desktop and mobile. Auth state is provided by the server (root
 * layout) so there's no first-paint flash.
 */
export function GuestHeaderGate({
  initialAuthed,
  initialIsAdmin,
  initialName,
  children,
}: {
  initialAuthed: boolean;
  initialIsAdmin: boolean;
  initialName: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname() || "/";
  const showHeader = isGuestRoute(pathname);
  // Bottom nav shows for signed-in guests on every guest route (incl. checkout).
  const showBottomNav = showHeader && initialAuthed;

  return (
    <>
      {showHeader ? (
        <SearchNav isAuthed={initialAuthed} isAdmin={initialIsAdmin} initialName={initialName} />
      ) : null}
      {children}
      {showBottomNav ? <GuestBottomNav /> : null}
    </>
  );
}
