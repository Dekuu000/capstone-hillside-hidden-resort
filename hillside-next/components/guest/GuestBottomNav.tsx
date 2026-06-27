"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarDays, TreePalm, UserRound } from "lucide-react";
import { cn } from "../../lib/cn";

const TABS = [
  { label: "Stays", href: "/stays", icon: CalendarDays },
  { label: "Tours", href: "/tours", icon: TreePalm },
  { label: "Trips", href: "/my-bookings", icon: BedDouble },
  { label: "Profile", href: "/guest/account", icon: UserRound },
];

/**
 * Airbnb-style mobile tab bar. Every tab has the SAME size + structure (equal
 * width, fixed icon box, label always shown) so switching tabs never reflows the
 * bar — active is shown via a filled icon pill + colour, not a different shape.
 */
export function GuestBottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/guest/account") {
      return pathname.startsWith("/guest/account") || pathname.startsWith("/guest/profile");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav data-testid="guest-bottom-nav" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto flex h-[72px] w-full max-w-[430px] items-stretch gap-1 rounded-[2rem] bg-[var(--color-surface)] px-2 shadow-[var(--shadow-md)]">
        {TABS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition",
                  active
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "text-[var(--color-muted)]",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold leading-none transition min-[380px]:text-[11px]",
                  active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
