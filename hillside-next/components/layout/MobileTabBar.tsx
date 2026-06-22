"use client";

import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

export type MobileTab = {
  href: string;
  name: string;
  icon: LucideIcon;
  active: boolean;
};

export type MobileFab = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

type MobileTabBarProps = {
  tabs: MobileTab[];
  fab: MobileFab | null;
  onMore: () => void;
  moreActive: boolean;
};

// Material-style active indicator: a teal-tinted pill sits behind the active
// icon so the selected tab is obvious at a glance (a plain color swap was too
// subtle). Shared by the tab links and the "More" button.
const PILL =
  "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200";
const PILL_ACTIVE = "bg-[color:color-mix(in_srgb,var(--color-secondary)_16%,white)] text-[var(--color-secondary)]";
const PILL_IDLE = "text-[var(--color-muted)] group-hover:text-[var(--color-text)] group-active:bg-[var(--color-background)]";
const LABEL_ACTIVE = "font-semibold text-[var(--color-secondary)]";
const LABEL_IDLE = "font-medium text-[var(--color-muted)]";

function TabButton({ tab }: { tab: MobileTab }) {
  return (
    <Link
      href={tab.href}
      aria-current={tab.active ? "page" : undefined}
      className="group flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1"
    >
      <span className={cn(PILL, tab.active ? PILL_ACTIVE : PILL_IDLE)}>
        <tab.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      </span>
      <span className={cn("max-w-full truncate text-[11px] leading-none transition-colors", tab.active ? LABEL_ACTIVE : LABEL_IDLE)}>
        {tab.name}
      </span>
    </Link>
  );
}

export function MobileTabBar({ tabs, fab, onMore, moreActive }: MobileTabBarProps) {
  // With a FAB, lift it into the middle: [tab, tab, FAB, ...rest, More].
  // Without one, render all tabs then More: [tab, tab, tab, tab, More].
  const leftTabs = fab ? tabs.slice(0, 2) : tabs;
  const rightTabs = fab ? tabs.slice(2) : [];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-[64px] max-w-md items-stretch justify-around px-1">
        {leftTabs.map((tab) => (
          <TabButton key={tab.href} tab={tab} />
        ))}

        {fab ? (
          <div className="flex flex-1 items-start justify-center">
            <Link href={fab.href} aria-label={fab.label} aria-current={fab.active ? "page" : undefined} className="-mt-5 flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-cta)] text-white shadow-[var(--shadow-md)] ring-4 ring-[var(--color-surface)] transition-transform active:scale-90 active:brightness-90",
                  fab.active ? "scale-105" : "",
                )}
              >
                <fab.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold leading-none text-[var(--color-text)]">{fab.label}</span>
            </Link>
          </div>
        ) : null}

        {rightTabs.map((tab) => (
          <TabButton key={tab.href} tab={tab} />
        ))}

        <button
          type="button"
          onClick={onMore}
          aria-haspopup="dialog"
          aria-label="More menu"
          className="group flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1"
        >
          <span className={cn(PILL, moreActive ? PILL_ACTIVE : PILL_IDLE)}>
            <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
          </span>
          <span className={cn("text-[11px] leading-none transition-colors", moreActive ? LABEL_ACTIVE : LABEL_IDLE)}>More</span>
        </button>
      </div>
    </nav>
  );
}
