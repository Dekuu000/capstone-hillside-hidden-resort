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

// Shared column so every label (tabs, FAB, More) lands on the same bottom
// baseline; the FAB circle just lifts above it. Active is shown with a small
// teal top-accent bar + vivid teal icon/label (no pill).
const CELL = "group relative flex min-h-[44px] flex-1 flex-col items-center justify-between pt-2.5 pb-1.5";
const ICON_ACTIVE = "text-[var(--color-primary)]";
const ICON_IDLE = "text-[var(--color-muted)] group-hover:text-[var(--color-text)]";
const LABEL_ACTIVE = "font-semibold text-[var(--color-primary)]";
const LABEL_IDLE = "font-medium text-[var(--color-muted)]";

function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-[var(--color-primary)]"
    />
  );
}

function TabButton({ tab }: { tab: MobileTab }) {
  return (
    <Link href={tab.href} aria-current={tab.active ? "page" : undefined} className={cn(CELL, "active:bg-[var(--color-background)]")}>
      {tab.active ? <ActiveBar /> : null}
      <tab.icon className={cn("h-5 w-5 shrink-0 transition-colors", tab.active ? ICON_ACTIVE : ICON_IDLE)} aria-hidden="true" />
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
          <Link
            href={fab.href}
            aria-label={fab.label}
            aria-current={fab.active ? "page" : undefined}
            className="flex min-h-[44px] flex-1 flex-col items-center justify-between pt-2.5 pb-1.5"
          >
            <span
              className={cn(
                "-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-md)] ring-4 ring-[var(--color-surface)] transition-transform active:scale-90 active:brightness-90",
                fab.active ? "scale-105" : "",
              )}
            >
              <fab.icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="text-[11px] font-medium leading-none text-[var(--color-text)]">{fab.label}</span>
          </Link>
        ) : null}

        {rightTabs.map((tab) => (
          <TabButton key={tab.href} tab={tab} />
        ))}

        <button type="button" onClick={onMore} aria-haspopup="dialog" aria-label="More menu" className={cn(CELL, "active:bg-[var(--color-background)]")}>
          {moreActive ? <ActiveBar /> : null}
          <MoreHorizontal className={cn("h-5 w-5 shrink-0 transition-colors", moreActive ? ICON_ACTIVE : ICON_IDLE)} aria-hidden="true" />
          <span className={cn("text-[11px] leading-none transition-colors", moreActive ? LABEL_ACTIVE : LABEL_IDLE)}>More</span>
        </button>
      </div>
    </nav>
  );
}
