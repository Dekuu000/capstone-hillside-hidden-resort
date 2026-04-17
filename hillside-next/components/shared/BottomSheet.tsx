"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)] sm:bottom-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-muted)]"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("max-h-[70vh] overflow-y-auto", className)}>{children}</div>
      </div>
    </div>
  );
}

