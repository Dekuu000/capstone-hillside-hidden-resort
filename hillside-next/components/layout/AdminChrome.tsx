"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ConciergeBell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
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

const COLLAPSE_STORAGE_KEY = "hh-admin-nav-collapsed";

// Each item is gated by capability tier. Front Desk sees operations only;
// Manager adds management; System Admin adds the technical tools.
const navigation: Array<{ name: string; href: string; tier: NavTier; icon: LucideIcon }> = [
  { name: "Dashboard", href: "/admin", tier: "management", icon: LayoutDashboard },
  { name: "Units", href: "/admin/units", tier: "management", icon: BedDouble },
  { name: "Reservations", href: "/admin/reservations", tier: "management", icon: CalendarCheck },
  { name: "Walk-in", href: "/admin/walk-in", tier: "operations", icon: UserPlus },
  { name: "Check-in", href: "/admin/check-in", tier: "operations", icon: ScanLine },
  { name: "Payments", href: "/admin/payments", tier: "management", icon: CreditCard },
  { name: "Services", href: "/admin/services", tier: "operations", icon: ConciergeBell },
  { name: "Reports", href: "/admin/reports", tier: "management", icon: BarChart3 },
  // Technical tools — System Admin only, with plain-language labels.
  { name: "Records & Security", href: "/admin/blockchain", tier: "technical", icon: ShieldCheck },
  { name: "Offline & Sync", href: "/admin/sync", tier: "technical", icon: RefreshCcw },
  { name: "Smart Pricing", href: "/admin/ai", tier: "technical", icon: Sparkles },
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
  // Desktop rail collapse. Defaults expanded so SSR/first paint matches; the
  // stored preference is applied after mount to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
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

  // Restore the saved collapse preference once, on the client.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* ignore storage access errors */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore storage access errors */
      }
      return next;
    });
  }, []);

  // Power-user shortcut: "[" toggles the rail (ignored while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

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
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-[var(--color-primary)] text-white transition-[transform,width] duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-[76px]" : "lg:w-64"}`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center gap-2 border-b border-white/15 px-6 py-7 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
            <HillsideLogo
              light
              compact
              className={`[&_img]:h-11 [&_img]:w-11 [&_.hillside-brand-title]:text-[1.2rem] [&_.hillside-brand-title]:font-semibold [&_.hillside-brand-subtitle]:text-[0.58rem] [&_.hillside-brand-subtitle]:tracking-[0.29em] ${
                collapsed ? "lg:[&_.hillside-brand-title]:hidden lg:[&_.hillside-brand-subtitle]:hidden" : ""
              }`}
            />
          </div>
          {!collapsed ? <p className="px-6 pt-3 text-sm text-teal-100">{roleLabel}</p> : null}

          <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-6">
            {visibleNavigation.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={!noPrefetchRoutes.has(item.href)}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                  } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "lg:sr-only" : ""}>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden border-t border-white/15 px-3 py-2 lg:block">
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white ${
                collapsed ? "justify-center px-0" : ""
              }`}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden="true" />}
              <span className={collapsed ? "sr-only" : ""}>Collapse</span>
            </button>
          </div>

          <div className={`border-t border-white/15 px-6 py-5 ${collapsed ? "lg:px-2" : ""}`}>
            <div className={`mb-4 flex items-center gap-3 ${collapsed ? "lg:justify-center" : ""}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-sm font-bold text-white">{initial}</div>
              <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-teal-100">{email || "admin"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title={collapsed ? "Sign Out" : undefined}
              aria-label="Sign Out"
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white ${
                collapsed ? "lg:justify-center lg:px-0" : ""
              }`}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={collapsed ? "lg:sr-only" : ""}>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={`transition-[padding] duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--color-primary)] text-white shadow-sm lg:hidden">
          <div className="flex h-[68px] items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-primary)]"
              aria-label={sidebarOpen ? "Close admin navigation menu" : "Open admin navigation menu"}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/admin" className="min-w-0" aria-label="Hillside Hidden Resort">
              <HillsideLogo
                light
                compact
                className="[&_img]:h-9 [&_img]:w-9 [&_.hillside-brand-title]:text-[1.05rem] [&_.hillside-brand-title]:font-semibold [&_.hillside-brand-subtitle]:text-[0.55rem] [&_.hillside-brand-subtitle]:tracking-[0.28em]"
              />
            </Link>
          </div>
        </header>

        <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-6 lg:py-6 2xl:px-8">{children}</main>
      </div>
    </div>
  );
}
