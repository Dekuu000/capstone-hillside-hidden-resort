"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient } from "../../lib/supabase";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      await clearServerSessionCookie().catch(() => null);
      router.replace("/login");
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="flex w-full items-center justify-between rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-left transition hover:shadow-[var(--shadow-md)] disabled:opacity-60"
    >
      <span className="flex items-center gap-3 font-semibold text-[var(--color-error)]">
        <LogOut className="h-5 w-5" />
        {busy ? "Signing out…" : "Sign out"}
      </span>
    </button>
  );
}
