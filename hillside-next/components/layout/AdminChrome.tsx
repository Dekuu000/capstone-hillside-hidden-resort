"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ConciergeBell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Star,
  Tag,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { HillsideLogo } from "../branding/HillsideLogo";
import { NotificationBell } from "../shared/NotificationBell";
import { MobileTabBar } from "./MobileTabBar";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { canAccessTier, ROLE_LABELS, ROLES, type NavTier, type Role } from "../../../packages/shared/src/types";

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
  { name: "Dashboard", href: "/admin", tier: "operations", icon: LayoutDashboard },
  { name: "Units", href: "/admin/units", tier: "management", icon: BedDouble },
  { name: "Reservations", href: "/admin/reservations", tier: "management", icon: CalendarCheck },
  { name: "Walk-in", href: "/admin/walk-in", tier: "operations", icon: UserPlus },
  { name: "Check-in", href: "/admin/check-in", tier: "operations", icon: ScanLine },
  { name: "Payments", href: "/admin/payments", tier: "management", icon: CreditCard },
  { name: "Services", href: "/admin/services", tier: "operations", icon: ConciergeBell },
  { name: "Reports", href: "/admin/reports", tier: "management", icon: BarChart3 },
  { name: "Reviews", href: "/admin/reviews", tier: "management", icon: Star },
  { name: "Promos", href: "/admin/promos", tier: "management", icon: Tag },
  { name: "Team", href: "/admin/team", tier: "management", icon: Users },
  // Technical tools — System Admin only, with plain-language labels.
  { name: "Records & Security", href: "/admin/blockchain", tier: "technical", icon: ShieldCheck },
  { name: "Offline & Sync", href: "/admin/sync", tier: "technical", icon: RefreshCcw },
  { name: "Smart Pricing", href: "/admin/ai", tier: "technical", icon: TrendingUp },
];

// Per-role mobile bottom-bar composition. Tabs are top-level destinations;
// the optional FAB is the role's hero action. Items not pinned here fall into
// the "More" sheet. `fabConsumes` marks a nav href that the FAB replaces (so it
// isn't also listed in More) — used by Front Desk where the FAB *is* Check-in.
type MobileNavConfig = {
  tabs: string[];
  fab: { href: string; label: string; icon: LucideIcon } | null;
  fabConsumes?: string;
};

const MOBILE_NAV: Record<Role, MobileNavConfig> = {
  guest: { tabs: ["/admin"], fab: null },
  // Front Desk: the orange FAB is Check-in itself (scan-first), so there is no
  // separate Check-in tab. All their destinations fit; More holds the account.
  staff: {
    tabs: ["/admin", "/admin/walk-in", "/admin/services"],
    fab: { href: "/admin/check-in?mode=scan", label: "Check-in", icon: ScanLine },
    fabConsumes: "/admin/check-in",
  },
  // Manager covers the desk, so keep a quick Scan QR action; Check-in workspace
  // stays available in More.
  admin: {
    tabs: ["/admin", "/admin/reservations", "/admin/payments"],
    fab: { href: "/admin/check-in?mode=scan", label: "Scan QR", icon: ScanLine },
  },
  // System Admin is oversight — five destinations, no scan action.
  super_admin: {
    tabs: ["/admin", "/admin/units", "/admin/reservations", "/admin/reports"],
    fab: null,
  },
};

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
  "/admin/team",
  "/admin/promos",
]);

export function AdminChrome({ children, initialName = null, initialEmail = null, role = null }: AdminChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  // Mobile "More" bottom sheet (desktop uses the full sidebar instead).
  const [moreOpen, setMoreOpen] = useState(false);
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

  // Mobile bottom-bar + "More" sheet, derived from the role's config and the
  // same capability filtering as the desktop sidebar.
  const mobileConfig = useMemo(() => {
    const key = (ROLES as readonly string[]).includes(role || "") ? (role as Role) : "staff";
    return MOBILE_NAV[key];
  }, [role]);
  const mobileTabs = useMemo(
    () =>
      mobileConfig.tabs
        .map((href) => navigation.find((item) => item.href === href))
        .filter((item): item is (typeof navigation)[number] => Boolean(item) && canAccessTier(role, item!.tier))
        .map((item) => ({ href: item.href, name: item.name, icon: item.icon, active: pathname === item.href })),
    [mobileConfig, role, pathname],
  );
  const mobileFab = useMemo(
    () => (mobileConfig.fab ? { ...mobileConfig.fab, active: pathname.startsWith("/admin/check-in") } : null),
    [mobileConfig, pathname],
  );
  const moreItems = useMemo(
    () =>
      visibleNavigation
        .filter((item) => !mobileConfig.tabs.includes(item.href) && item.href !== mobileConfig.fabConsumes)
        .map((item) => ({ href: item.href, name: item.name, icon: item.icon, active: pathname === item.href })),
    [visibleNavigation, mobileConfig, pathname],
  );
  const moreActive = moreOpen || moreItems.some((item) => item.active);

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
      {/* Desktop sidebar. On mobile it stays off-canvas — navigation there is
          handled by the bottom tab bar + More sheet rendered below. */}
      <aside
        id="admin-sidebar"
        className={`fixed left-0 top-0 z-50 hidden h-full w-64 transform bg-[var(--color-primary)] text-white transition-[transform,width] duration-300 lg:block lg:translate-x-0 ${
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        }`}
      >
        {/* Edge toggle — sits on the seam between the rail and the content,
            aligned with the header row. Desktop only; mobile uses the hamburger. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          className="absolute -right-3.5 top-9 z-50 hidden h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-primary)] shadow-[var(--shadow-md)] transition hover:scale-105 hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)] active:scale-95 lg:flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
        </button>

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
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "lg:sr-only" : ""}>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className={`border-t border-white/15 px-6 py-5 ${collapsed ? "lg:px-2" : ""}`}>
            <div className={`mb-4 flex items-center gap-3 ${collapsed ? "lg:justify-center" : ""}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-sm font-bold text-white">{initial}</div>
              <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-teal-100">{email || "admin"}</p>
              </div>
              <div className={`ml-auto ${collapsed ? "hidden" : "hidden lg:block"}`}>
                <NotificationBell light placement="top-start" />
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
        <header className="sticky top-0 z-30 bg-gradient-to-br from-[#1a4163] via-[var(--color-primary)] to-[#0e2740] text-white shadow-[0_6px_20px_-8px_rgba(19,48,76,0.6)] lg:hidden">
          <div className="flex h-16 items-center gap-3 px-4">
            <Link href="/admin" className="flex min-w-0 items-center" aria-label="Hillside Hidden Resort">
              <HillsideLogo
                light
                oneLine
                className="[&_img]:h-8 [&_img]:w-8 [&_.hillside-brand-title]:text-[1rem] [&_.hillside-brand-title]:font-semibold [&_.hillside-brand-title]:tracking-[0.015em]"
              />
            </Link>
            <div className="ml-auto flex items-center">
              <NotificationBell light />
            </div>
          </div>
          {/* Subtle teal hairline accent — brand-tied depth instead of a flat border. */}
          <span
            aria-hidden="true"
            className="block h-px w-full bg-gradient-to-r from-transparent via-[color:color-mix(in_srgb,var(--color-secondary)_60%,transparent)] to-transparent"
          />
        </header>

        <main className="px-4 py-4 pb-[84px] sm:px-6 sm:py-6 lg:px-6 lg:py-6 lg:pb-6 2xl:px-8">{children}</main>
      </div>

      <MobileTabBar tabs={mobileTabs} fab={mobileFab} onMore={() => setMoreOpen(true)} moreActive={moreActive} />
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={moreItems}
        name={name}
        email={email}
        initial={initial}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
