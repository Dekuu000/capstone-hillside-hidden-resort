"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BedDouble, Bell, CalendarDays, ChevronDown, LogOut, MapPin, Mountain, Plug, RefreshCcw, Unplug, UserRound, Wallet } from "lucide-react";
import { myProfileResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyProfileResponse } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserDisplayName } from "../../lib/userProfile";
import { useToast } from "../shared/ToastProvider";
import { HillsideLogo } from "../branding/HillsideLogo";
import { GuestBottomNav } from "../guest/GuestBottomNav";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

const navItems = [
  { label: "Book Now", href: "/book", icon: CalendarDays },
  { label: "Tours", href: "/tours", icon: Mountain },
  { label: "Map", href: "/guest/map", icon: MapPin },
  { label: "Services", href: "/guest/services", icon: Bell },
  { label: "My Bookings", href: "/my-bookings", icon: BedDouble },
];

const guestMenuItemClass =
  "inline-flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50 disabled:opacity-60";

export function GuestChrome({ children, initialName = null, initialEmail = null }: GuestChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(initialName || "Guest");
  const [email, setEmail] = useState(initialEmail || "");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted) return;
      setAccessToken(session?.access_token ?? null);
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
      setAccessToken(session?.access_token ?? null);
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

  useEffect(() => {
    if (!accessToken) {
      setWalletAddress(null);
      return;
    }
    let cancelled = false;
    const loadWallet = async () => {
      try {
        const profile = await apiFetch<MyProfileResponse>(
          "/v2/me/profile",
          { method: "GET" },
          accessToken,
          myProfileResponseSchema,
        );
        if (cancelled) return;
        setWalletAddress(profile.wallet_address?.trim() || null);
      } catch {
        if (cancelled) return;
        setWalletAddress(null);
      }
    };
    void loadWallet();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "G", [name]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await clearServerSessionCookie().catch(() => null);
    router.replace("/login");
  };

  const patchWallet = async (value: string | null) => {
    if (!accessToken) {
      throw new Error("Session expired. Please sign in again.");
    }
    const profile = await apiFetch<MyProfileResponse>(
      "/v2/me/profile",
      {
        method: "PATCH",
        body: JSON.stringify({
          wallet_address: value,
          wallet_chain: "evm",
        }),
      },
      accessToken,
      myProfileResponseSchema,
    );
    setWalletAddress(profile.wallet_address?.trim() || null);
  };

  const connectWallet = async () => {
    const provider = (window as typeof window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } })
      .ethereum;
    if (!provider?.request) {
      showToast({
        type: "error",
        title: "Wallet unavailable",
        message: "Install MetaMask or another EVM wallet.",
      });
      return;
    }
    setWalletBusy(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const nextAddress = accounts?.[0]?.trim();
      if (!nextAddress) throw new Error("No wallet account returned.");
      await patchWallet(nextAddress);
      showToast({ type: "success", title: "Wallet connected" });
    } catch (unknownError) {
      showToast({
        type: "error",
        title: "Wallet connection failed",
        message: getApiErrorMessage(unknownError, "Unable to connect wallet."),
      });
    } finally {
      setWalletBusy(false);
    }
  };

  const disconnectWallet = async () => {
    setWalletBusy(true);
    try {
      await patchWallet(null);
      showToast({ type: "success", title: "Wallet disconnected" });
    } catch (unknownError) {
      showToast({
        type: "error",
        title: "Wallet update failed",
        message: getApiErrorMessage(unknownError, "Unable to disconnect wallet."),
      });
    } finally {
      setWalletBusy(false);
    }
  };

  const walletDisplay = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "Not connected";

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
      <header data-testid="guest-header" className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[70px] w-full max-w-[430px] items-center justify-between px-4 md:h-20 md:max-w-[1440px] md:px-6 lg:px-8">
          <Link href="/book" className="flex items-center gap-2">
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
                      : "text-slate-600 hover:bg-slate-100 hover:text-[var(--color-primary)]"
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
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-text)] shadow-sm transition hover:bg-slate-50"
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
                    href="/guest/profile"
                    role="menuitem"
                    className={guestMenuItemClass}
                  >
                    <UserRound className="h-4 w-4 text-[var(--color-muted)]" />
                    Profile settings
                  </Link>
                  <Link
                    href="/guest/my-stay"
                    role="menuitem"
                    className={guestMenuItemClass}
                  >
                    <BedDouble className="h-4 w-4 text-[var(--color-muted)]" />
                    My stay
                  </Link>
                  <Link
                    href="/guest/sync"
                    role="menuitem"
                    className={guestMenuItemClass}
                  >
                    <RefreshCcw className="h-4 w-4 text-[var(--color-muted)]" />
                    Sync center
                  </Link>
                  <div className="my-1 border-t border-[var(--color-border)] pt-2">
                    <div className="px-3 pb-2">
                      <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                        <Wallet className="h-3 w-3" />
                        Wallet
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--color-text)]">{walletDisplay}</p>
                    </div>
                    {walletAddress ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={walletBusy}
                        onClick={() => void disconnectWallet()}
                        className={guestMenuItemClass}
                      >
                        <Unplug className="h-4 w-4 text-[var(--color-muted)]" />
                        {walletBusy ? "Disconnecting..." : "Disconnect wallet"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={walletBusy}
                        onClick={() => void connectWallet()}
                        className={guestMenuItemClass}
                      >
                        <Plug className="h-4 w-4 text-[var(--color-muted)]" />
                        {walletBusy ? "Connecting..." : "Connect wallet"}
                      </button>
                    )}
                  </div>
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
