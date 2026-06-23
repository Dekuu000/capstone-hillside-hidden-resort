"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogOut, X, type LucideIcon } from "lucide-react";

export type MoreItem = {
  href: string;
  name: string;
  icon: LucideIcon;
  active: boolean;
};

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
  items: MoreItem[];
  name: string;
  email: string;
  initial: string;
  onSignOut: () => void;
};

export function MobileMoreSheet({ open, onClose, items, name, email, initial, onSignOut }: MobileMoreSheetProps) {
  // Close on Escape; lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More menu">
      <div className="absolute inset-0 bg-black/50 motion-safe:animate-[fadeIn_150ms_ease-out]" onClick={onClose} />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] shadow-[var(--shadow-card)] motion-safe:animate-[slideUp_200ms_ease-out]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--color-border)]" aria-hidden="true" />
          <p className="absolute left-4 text-sm font-semibold text-[var(--color-text)]">More</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {items.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium transition-colors ${
                  item.active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="leading-tight">{item.name}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="border-t border-[var(--color-border)] px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{email || "admin"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
