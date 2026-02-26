"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type GuestChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

const navItems = [
  { label: "Book Now", href: "/book" },
  { label: "Tours", href: "/tours" },
  { label: "My Bookings", href: "/my-bookings" },
];

export function GuestChrome({ children, initialName = null, initialEmail = null }: GuestChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState(initialName || "Guest");
  const [email, setEmail] = useState(initialEmail || "");

  useEffect(() => {
    if (initialEmail) {
      return;
    }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const user = data.session?.user;
      if (!user) return;
      const displayName =
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
        user.email ||
        "Guest";
      setName(displayName);
      setEmail(user.email ?? "");
    });
    return () => {
      mounted = false;
    };
  }, [initialEmail]);

  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || "G", [name]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[#eff6ff]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/book" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a8a] text-sm font-bold text-white">H</div>
            <span className="hidden text-xl font-bold text-[#1e3a8a] sm:inline">Hillside Resort</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`text-sm font-medium transition ${active ? "text-[#1e3a8a]" : "text-slate-700 hover:text-[#1e3a8a]"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">{email || "guest"}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e3a8a] text-xs font-semibold text-white sm:hidden">{initial}</div>
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 lg:px-8 md:pb-8">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white md:hidden">
        <div className="flex h-16 items-center justify-around">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.label} href={item.href} className={`text-xs font-medium ${active ? "text-[#1e3a8a]" : "text-slate-600"}`}>
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={handleSignOut} className="text-xs font-medium text-slate-600">
            Logout
          </button>
        </div>
      </nav>
    </div>
  );
}
