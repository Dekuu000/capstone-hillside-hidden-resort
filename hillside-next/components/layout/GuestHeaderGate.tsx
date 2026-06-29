"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SearchNav } from "../booking/SearchNav";
import { GuestBottomNav } from "../guest/GuestBottomNav";
import { CheckinWelcomeToast } from "../guest/CheckinWelcomeToast";
import { safeGetSession } from "../../lib/supabase";

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

  // Reconcile the server-provided auth state with the LIVE browser session. If a
  // stale (client Router Cache) layout says "authed" but there's no real session,
  // downgrade to logged-out so the header never shows a signed-out visitor as a
  // signed-in user. This only ever downgrades — it never fabricates a session.
  const [authed, setAuthed] = useState(initialAuthed);
  useEffect(() => {
    if (!initialAuthed) return; // nothing to downgrade
    let active = true;
    void safeGetSession().then(({ session }) => {
      if (!active) return;
      if (!session?.access_token) setAuthed(false);
    });
    return () => {
      active = false;
    };
  }, [initialAuthed]);

  const showBottomNav = showHeader && authed;

  return (
    <>
      {showHeader ? (
        <SearchNav isAuthed={authed} isAdmin={authed && initialIsAdmin} initialName={authed ? initialName : null} />
      ) : null}
      {children}
      {showBottomNav ? <GuestBottomNav /> : null}
      {authed && showHeader ? <CheckinWelcomeToast /> : null}
    </>
  );
}
