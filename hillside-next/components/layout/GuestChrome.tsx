"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BedDouble, Bell, CalendarDays, ChevronDown, LogOut, MapPin, Mountain, UserRound } from "lucide-react";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { HillsideLogo } from "../branding/HillsideLogo";
import { GuestBottomNav } from "../guest/GuestBottomNav";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

const navItems = [
  { label: "Stays", href: "/stays", icon: CalendarDays },
  { label: "Tours", href: "/tours", icon: Mountain },
  { label: "Map", href: "/guest/map", icon: MapPin },
  { label: "Services", href: "/guest/services", icon: Bell },
  { label: "My Trips", href: "/my-bookings", icon: BedDouble },
];

const guestMenuItemClass =
  "inline-flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-60";

export function GuestChrome({ children, initialName = null, initialEmail = null }: GuestChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState(initialName || "Guest");
  const [email, setEmail] = useState(initialEmail || "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted) return;
      const user = session?.user;
      if (!user) return;
      if (!initialName) {
        setName(resolveUserDisplayName(user, "Guest"));
      }
      if (!initialEmail) {
        setEmail(user.email ?? "");
      }
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const user = session?.user;
      if (!user) return;
      if (!initialName) {
        setName(resolveUserDisplayName(user, "Guest"));
      }
      if (!initialEmail) {
        setEmail(user.email ?? "");
      }
    });
    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [initialEmail, initialName]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "G", [name]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await clearServerSessionCookie().catch(() => null);
    router.replace("/login");
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <header data-testid="guest-header" className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-[70px] w-full max-w-[430px] items-center justify-between px-4 md:h-20 md:max-w-[1440px] md:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <HillsideLogo compact className="[&_svg]:h-9 [&_svg]:w-9 min-[390px]:[&_svg]:h-10 min-[390px]:[&_svg]:w-10 [&_p:first-of-type]:text-[1.2rem] [&_p:first-of-type]:font-semibold min-[390px]:[&_p:first-of-type]:text-[1.3rem] [&_p:last-child]:text-[0.62rem] [&_p:last-child]:tracking-[0.30em] md:[&_svg]:h-11 md:[&_svg]:w-11 md:[&_p:first-of-type]:text-[1.6rem] md:[&_p:last-child]:text-[0.68rem]" />
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
                  }`}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)] shadow-sm transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)]"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open guest profile menu"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
                  {initial}
                </span>
                <ChevronDown className="h-4 w-4 text-[var(--color-muted)]" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-md)]"
                >
                  <div className="guest-surface-soft mb-1 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name || "Guest"}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{email || "guest"}</p>
                  </div>
                  <Link
                    href="/guest/my-stay"
                    role="menuitem"
                    className={guestMenuItemClass}
                  >
                    <BedDouble className="h-4 w-4 text-[var(--color-muted)]" />
                    My stay
                  </Link>
                  <Link
                    href="/guest/profile"
                    role="menuitem"
                    className={guestMenuItemClass}
                  >
                    <UserRound className="h-4 w-4 text-[var(--color-muted)]" />
                    Profile settings
                  </Link>
                  <div className="my-1 border-t border-[var(--color-border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className={guestMenuItemClass}
                  >
                    <LogOut className="h-4 w-4 text-[var(--color-muted)]" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 overflow-x-hidden px-4 pb-40 pt-5 md:max-w-[1280px] md:gap-6 md:px-6 md:pb-8 md:pt-6 lg:px-8">
        {children}
      </main>

      <GuestBottomNav items={navItems} isActive={isActive} />
    </div>
  );
}
