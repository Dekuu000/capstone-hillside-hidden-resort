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
          "flex h-full w-full flex-col bg-[var(--color-surface)] shadow-[var(--shadow-lg)] sm:rounded-l-[var(--radius-xl)] sm:overflow-hidden",
          size === "sm" && "max-w-[420px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[720px]",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-[-0.01em] text-[var(--color-text)]">{title}</h2>
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
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </aside>
    </div>
  );
}
