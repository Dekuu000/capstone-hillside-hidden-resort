"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close detail drawer"
        onClick={onClose}
        className="h-full flex-1 bg-slate-900/40 backdrop-blur-[1px]"
      />
      <aside
        className={cn(
          "h-full w-full bg-[var(--color-surface)] shadow-[var(--shadow-lg)]",
          size === "sm" && "max-w-[420px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[720px]",
        )}
      >
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-muted)] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          >
            Close
          </button>
        </header>
        <div className="h-[calc(100%-78px)] overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </div>
  );
}
