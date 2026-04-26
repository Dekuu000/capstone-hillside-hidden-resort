"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

type ModalDialogProps = {
  titleId: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
  zIndexClass?: string;
  overlayClassName?: string;
  panelClassName?: string;
  closeLabel?: string;
  closeButtonClassName?: string;
};

export function ModalDialog({
  titleId,
  title,
  onClose,
  children,
  maxWidthClass = "md:max-w-xl",
  zIndexClass = "z-40",
  overlayClassName = "bg-slate-900/50",
  panelClassName,
  closeLabel = "Close",
  closeButtonClassName,
}: ModalDialogProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center p-0 md:items-center md:p-4",
        zIndexClass,
        overlayClassName,
      )}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 md:rounded-2xl",
          maxWidthClass,
          panelClassName,
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600",
              closeButtonClassName,
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
