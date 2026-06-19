"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
    <nav data-testid="guest-bottom-nav" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto flex h-[72px] w-full max-w-[430px] items-center justify-around gap-1 rounded-[2rem] bg-[var(--color-surface)] px-2 shadow-[var(--shadow-md)]">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-w-0 items-center justify-center rounded-2xl transition",
                active
                  ? "h-12 w-12 bg-[var(--color-primary)] text-white shadow-sm"
                  : "flex-col gap-1 px-2 py-2 text-[10px] font-semibold text-[var(--color-muted)] min-[380px]:text-[11px]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!active ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
