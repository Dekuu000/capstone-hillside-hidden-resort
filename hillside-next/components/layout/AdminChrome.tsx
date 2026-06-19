"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { HillsideLogo } from "../branding/HillsideLogo";
import { canAccessTier, ROLE_LABELS, type NavTier, type Role } from "../../../packages/shared/src/types";

type AdminChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
  role?: string | null;
};

// Each item is gated by capability tier. Front Desk sees operations only;
// Manager adds management; System Admin adds the technical tools.
const navigation: Array<{ name: string; href: string; tier: NavTier }> = [
  { name: "Dashboard", href: "/admin", tier: "management" },
  { name: "Units", href: "/admin/units", tier: "management" },
  { name: "Reservations", href: "/admin/reservations", tier: "management" },
  { name: "Walk-in", href: "/admin/walk-in", tier: "operations" },
  { name: "Check-in", href: "/admin/check-in", tier: "operations" },
  { name: "Payments", href: "/admin/payments", tier: "management" },
  { name: "Services", href: "/admin/services", tier: "operations" },
  { name: "Reports", href: "/admin/reports", tier: "management" },
  // Technical tools — System Admin only, with plain-language labels.
  { name: "Records & Security", href: "/admin/blockchain", tier: "technical" },
  { name: "Offline & Sync", href: "/admin/sync", tier: "technical" },
  { name: "Smart Pricing", href: "/admin/ai", tier: "technical" },
];

const noPrefetchRoutes = new Set([
  "/admin/escrow",
  "/admin/ai",
  "/admin/reports",
  "/admin/reservations",
  "/admin/walk-in",
  "/admin/payments",
  "/admin/services",
  "/admin/blockchain",
  "/admin/sync",
  "/admin/units",
]);

export function AdminChrome({ children, initialName = null, initialEmail = null, role = null }: AdminChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [name, setName] = useState(initialName || "Admin");
  const [email, setEmail] = useState(initialEmail || "");

  const visibleNavigation = useMemo(
    () => navigation.filter((item) => canAccessTier(role, item.tier)),
    [role],
  );
  const roleLabel = ROLE_LABELS[(role || "") as Role] || "Back office";

  useEffect(() => {
    if (initialEmail) {
      return;
    }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    void safeGetSession().then(({ session }) => {
      if (!mounted) return;
      const user = session?.user;
      if (!user) return;
      setName(resolveUserDisplayName(user, "Admin"));
      setEmail(user.email ?? "");
    });

    return () => {
      mounted = false;
    };
  }, [initialEmail]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "A", [name]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await clearServerSessionCookie().catch(() => null);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {sidebarOpen ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      <aside
        id="admin-sidebar"
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-[var(--color-primary)] text-white transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/15 px-6 py-7">
            <HillsideLogo
              light
              compact
              className="[&_img]:h-11 [&_img]:w-11 [&_.hillside-brand-title]:text-[1.2rem] [&_.hillside-brand-title]:font-semibold [&_.hillside-brand-subtitle]:text-[0.58rem] [&_.hillside-brand-subtitle]:tracking-[0.29em]"
            />
            <p className="mt-2 text-sm text-teal-100">{roleLabel}</p>
          </div>

          <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-6">
            {visibleNavigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={!noPrefetchRoutes.has(item.href)}
                  className={`block rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/15 px-6 py-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-cta)] text-sm font-bold text-white">{initial}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-teal-100">{email || "admin"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/90 shadow-sm backdrop-blur lg:hidden">
          <div className="flex h-[72px] items-center justify-between px-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`group inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)] focus-visible:ring-offset-2 ${
                sidebarOpen
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-slate-200 bg-white text-[var(--color-primary)] hover:border-teal-200 hover:bg-teal-50 hover:text-[var(--color-secondary)]"
              }`}
              aria-label={sidebarOpen ? "Close admin navigation menu" : "Open admin navigation menu"}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-xl transition ${
                  sidebarOpen ? "bg-white/12" : "bg-slate-100 group-hover:bg-white"
                }`}
                aria-hidden="true"
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </span>
              <span className="hidden min-[360px]:inline">{sidebarOpen ? "Close" : "Menu"}</span>
            </button>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Hillside Hidden</h2>
            <div className="w-[88px]" aria-hidden="true" />
          </div>
        </header>

        <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-6 lg:py-6 2xl:px-8">{children}</main>
      </div>
    </div>
  );
}


