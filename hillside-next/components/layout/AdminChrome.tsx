"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type AdminChromeProps = {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
};

const navigation = [
  { name: "Dashboard", href: "/admin" },
  { name: "Units", href: "/admin/units" },
  { name: "Reservations", href: "/admin/reservations" },
  { name: "Walk-in Tour", href: "/admin/walk-in-tour" },
  { name: "Check-in", href: "/admin/check-in" },
  { name: "Payments", href: "/admin/payments" },
  { name: "Escrow", href: "/admin/escrow" },
  { name: "Reports", href: "/admin/reports" },
  { name: "Audit Logs", href: "/admin/audit" },
];

export function AdminChrome({ children, initialName = null, initialEmail = null }: AdminChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [name, setName] = useState(initialName || "Admin");
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
        "Admin";
      setName(displayName);
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
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[#eff6ff]">
      {sidebarOpen ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-[#1e3a8a] text-white transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-6 py-7">
            <h1 className="text-2xl font-bold">Hillside Resort</h1>
            <p className="mt-1 text-sm text-blue-200">Admin Panel</p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-3 text-sm font-medium transition ${
                    active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-6 py-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f97316] text-sm font-bold text-white">{initial}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-blue-200">{email || "admin"}</p>
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
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <h2 className="text-base font-semibold text-slate-900">Hillside Resort</h2>
            <div className="w-9" />
          </div>
        </header>

        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
