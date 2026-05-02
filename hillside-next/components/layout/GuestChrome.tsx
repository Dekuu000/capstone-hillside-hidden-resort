"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BedDouble, ChevronDown, LogOut, Plug, RefreshCcw, Unplug, UserRound, Wallet } from "lucide-react";
import { myProfileResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyProfileResponse } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { useToast } from "../shared/ToastProvider";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

const navItems = [
  { label: "Book Now", href: "/book" },
  { label: "Tours", href: "/tours" },
  { label: "Map", href: "/guest/map" },
  { label: "Services", href: "/guest/services" },
  { label: "My Bookings", href: "/my-bookings" },
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
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAccessToken(data.session?.access_token ?? null);
      const user = data.session?.user;
      if (!user) return;
      if (!initialName) {
        const displayName =
          (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
          user.email ||
          "Guest";
        setName(displayName);
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
        const displayName =
          (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
          user.email ||
          "Guest";
        setName(displayName);
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
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
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
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/book" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm font-bold text-white">H</div>
            <span className="hidden text-lg font-bold text-[var(--color-text)] sm:inline">Hillside Resort</span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="guest-nav-pill text-sm"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
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
                className="guest-secondary-cta guest-secondary-cta-sm rounded-full px-2.5 text-[var(--color-text)]"
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

      <main className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 md:pb-8">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--color-border)] bg-white md:hidden">
        <div className="no-scrollbar flex h-16 items-center gap-2 overflow-x-auto px-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className="guest-nav-pill guest-nav-pill-sm min-w-fit whitespace-nowrap"
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
