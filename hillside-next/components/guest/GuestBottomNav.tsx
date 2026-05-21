"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TreePalm } from "lucide-react";
import { cn } from "../../lib/cn";

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type GuestBottomNavProps = {
  items: Item[];
  isActive: (href: string) => boolean;
};

export function GuestBottomNav({ items, isActive }: GuestBottomNavProps) {
  return (
    <nav data-testid="guest-bottom-nav" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/70 bg-white/90 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto grid h-[72px] w-full max-w-[430px] grid-cols-5 items-center gap-1 rounded-[2rem] bg-white px-2 shadow-lg">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.label === "Tours" ? TreePalm : item.icon;
          const isBookings = item.href === "/my-bookings";
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-w-0 items-center justify-center rounded-2xl transition",
                active
                  ? "h-12 w-12 bg-[var(--color-primary)] text-white shadow-sm"
                  : "flex-col gap-1 px-1 py-2 text-[10px] font-semibold text-slate-500 min-[380px]:text-[11px]",
              )}
            >
              <Icon className={cn(active ? "h-4 w-4 shrink-0" : "h-4 w-4")} />
              {!active ? <span className="truncate">{isBookings ? "Bookings" : item.label}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
