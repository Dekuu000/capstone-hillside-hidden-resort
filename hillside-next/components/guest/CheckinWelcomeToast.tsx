"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { apiFetch } from "../../lib/apiClient";
import { safeGetSession } from "../../lib/supabase";
import { stayDashboardResponseSchema } from "../../../packages/shared/src/schemas";

// Shared with the My Trips welcome modal so a guest is greeted exactly once per
// reservation — whichever surface fires first sets the flag.
const WELCOMED_PREFIX = "hs_checkin_welcomed:";

/**
 * Page-independent check-in greeting. Lives in the persistent guest chrome, so it
 * can pop a toast on ANY guest page (Home / Map / Services / a listing) the moment
 * staff scans the QR — not just My Trips. On /my-bookings it stays silent because
 * that page shows its own richer welcome modal.
 */
export function CheckinWelcomeToast() {
  const pathname = usePathname() || "/";
  const [shown, setShown] = useState<{ id: string; code: string } | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const alreadyWelcomed = (id: string) => {
      try {
        return Boolean(window.localStorage.getItem(`${WELCOMED_PREFIX}${id}`));
      } catch {
        return false;
      }
    };
    const markWelcomed = (id: string) => {
      try {
        window.localStorage.setItem(`${WELCOMED_PREFIX}${id}`, "1");
      } catch {
        /* storage blocked — still greet once this session */
      }
    };

    const poll = async () => {
      if (stoppedRef.current) return;
      try {
        const { session } = await safeGetSession();
        const token = session?.access_token;
        if (token && pathname !== "/my-bookings") {
          const data = await apiFetch(
            "/v2/me/stay-dashboard",
            { method: "GET" },
            token,
            stayDashboardResponseSchema,
          );
          const stay = data?.reservation ?? null;
          const id = stay?.reservation_id ? String(stay.reservation_id) : "";
          const status = String(stay?.status || "").toLowerCase();
          if (id && status === "checked_in" && !alreadyWelcomed(id)) {
            markWelcomed(id);
            setShown({ id, code: String(stay?.reservation_code || "") });
          }
        }
      } catch {
        // transient — retry next tick
      }
      if (!stoppedRef.current) timer = setTimeout(poll, 20000);
    };

    timer = setTimeout(poll, 4000);
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 9000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-[var(--shadow-md)]">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">You&apos;re checked in</p>
          <p className="mt-0.5 text-xs muted-text">
            Welcome to Hillside Hidden Resort{shown.code ? ` (${shown.code})` : ""}! Your stay is now active.
          </p>
          <Link
            href="/my-bookings"
            onClick={() => setShown(null)}
            className="mt-1.5 inline-block text-xs font-semibold text-[var(--color-secondary)] hover:underline"
          >
            View my stay →
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setShown(null)}
          aria-label="Dismiss"
          className="shrink-0 text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
