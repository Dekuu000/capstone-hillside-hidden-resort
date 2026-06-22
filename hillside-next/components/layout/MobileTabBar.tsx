"use client";

import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

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

function TabButton({ tab }: { tab: MobileTab }) {
  return (
    <Link
      href={tab.href}
      aria-current={tab.active ? "page" : undefined}
      className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors active:bg-[var(--color-background)] active:text-[var(--color-primary)] ${
        tab.active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      <tab.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate">{tab.name}</span>
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
      <div className="mx-auto flex h-[60px] max-w-md items-stretch justify-around px-1">
        {leftTabs.map((tab) => (
          <TabButton key={tab.href} tab={tab} />
        ))}

        {fab ? (
          <div className="flex flex-1 items-start justify-center">
            <Link
              href={fab.href}
              aria-label={fab.label}
              aria-current={fab.active ? "page" : undefined}
              className="-mt-5 flex flex-col items-center gap-0.5"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-cta)] text-white shadow-[var(--shadow-md)] ring-4 ring-[var(--color-surface)] transition-transform active:scale-90 active:brightness-90 ${
                  fab.active ? "scale-105" : ""
                }`}
              >
                <fab.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold text-[var(--color-text)]">{fab.label}</span>
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
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors active:bg-[var(--color-background)] active:text-[var(--color-primary)] ${
            moreActive ? "text-[var(--color-primary)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
