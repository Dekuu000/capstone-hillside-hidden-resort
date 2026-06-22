"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional sticky action bar pinned to the bottom of the sheet/drawer. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;

  return (
    // Mobile: a bottom sheet that sizes to its content (up to 85vh), sitting
    // above the bottom tab bar (h-16) so the nav stays visible. Desktop: a
    // full-height right-side drawer.
    <div className="fixed inset-x-0 top-0 bottom-16 z-50 flex flex-col justify-end lg:bottom-0 lg:flex-row">
      <button
        type="button"
        aria-label="Close detail drawer"
        onClick={onClose}
        // Extends past the container's bottom (-bottom-16) so the scrim also
        // dims the bottom nav while the sheet floats above it.
        className="absolute inset-x-0 top-0 -bottom-16 bg-slate-900/40 backdrop-blur-[1px] lg:static lg:bottom-0 lg:h-full lg:flex-1"
      />
      <aside
        className={cn(
          "relative z-10 mb-3 flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-[var(--shadow-lg)] motion-safe:animate-[slideUp_220ms_ease-out] lg:mb-0",
          "lg:z-0 lg:h-full lg:max-h-none lg:rounded-l-[var(--radius-xl)] lg:rounded-t-none lg:overflow-hidden lg:animate-none",
          size === "sm" && "lg:max-w-[420px]",
          size === "md" && "lg:max-w-[560px]",
          size === "lg" && "lg:max-w-[720px]",
        )}
      >
        {/* Drag handle — mobile sheet affordance only. */}
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border)] lg:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-xl">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 sm:px-6">{footer}</div>
        ) : null}
      </aside>
    </div>
  );
}
