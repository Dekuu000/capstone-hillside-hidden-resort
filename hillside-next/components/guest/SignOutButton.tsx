"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { clearOfflineUserData, clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient } from "../../lib/supabase";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      await clearServerSessionCookie().catch(() => null);
      await clearOfflineUserData();
      // Full-page navigation (not router.replace) so Next's client Router Cache
      // is wiped — otherwise the cached, logged-in root layout/header would still
      // show the previous user on the landing page after sign-out.
      window.location.assign("/login");
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] pt-4">
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--color-error)] underline-offset-4 transition hover:bg-[color:color-mix(in_srgb,var(--color-error)_8%,white)] hover:underline disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
