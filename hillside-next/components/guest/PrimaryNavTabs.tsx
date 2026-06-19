"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarDays, TreePalm } from "lucide-react";
import { cn } from "../../lib/cn";

const TABS = [
  { label: "Stays", href: "/stays", icon: CalendarDays },
  { label: "Tours", href: "/tours", icon: TreePalm },
  { label: "Trips", href: "/my-bookings", icon: BedDouble },
];

/**
 * Centered primary nav (Stays / Tours / Trips) shared by the public funnel
 * header and the logged-in guest shell so both headers match.
 */
export function PrimaryNavTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className={cn("hidden items-center gap-2 lg:flex", className)}>
      {TABS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            data-active={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
              active
                ? "bg-[var(--color-primary)] text-white shadow-sm"
                : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
