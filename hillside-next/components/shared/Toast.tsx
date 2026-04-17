"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

type ToastType = "success" | "error" | "info";

const tone: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function Toast({
  type = "info",
  title,
  message,
  durationMs = 5000,
}: {
  type?: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, message, title, type]);

  if (!visible) return null;

  return (
    <div className={cn("rounded-xl border p-3 text-sm", tone[type])} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          {message ? <p className="mt-1">{message}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-md p-1 hover:bg-black/5"
          aria-label="Close toast"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
