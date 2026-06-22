"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { cn } from "../../lib/cn";

/**
 * The avatar + "Profile" pill shown in the top-right of every guest-facing
 * header (public funnel + logged-in shell), linking to the Profile hub.
 * Shared so the two headers stay identical.
 */
export function ProfilePill({ initialName = null }: { initialName?: string | null }) {
  const pathname = usePathname();
  const [name, setName] = useState(initialName || "Guest");

  useEffect(() => {
    if (initialName) return;
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted || !session?.user) return;
      setName(resolveUserDisplayName(session.user, "Guest"));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || !session?.user) return;
      setName(resolveUserDisplayName(session.user, "Guest"));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [initialName]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "G", [name]);
  const active = pathname.startsWith("/guest/account") || pathname.startsWith("/guest/profile");

  return (
    <Link
      href="/guest/account"
      aria-label="Profile and account"
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-4 text-sm font-semibold transition",
        active
          ? "bg-[var(--color-primary)] text-white shadow-sm"
          : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
          active
            ? "bg-white/20 text-white"
            : "bg-[color:color-mix(in_srgb,var(--color-primary)_12%,white)] text-[var(--color-primary)]",
        )}
      >
        {initial}
      </span>
      <span className="hidden sm:inline">Profile</span>
    </Link>
  );
}
