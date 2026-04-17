"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { getGuestPaymentInstructions } from "../../lib/paymentInstructions";

type GcashPaymentGuideProps = {
  className?: string;
  compact?: boolean;
  onCopyMessage?: (message: string) => void;
};

export function GcashPaymentGuide({
  className,
  compact = false,
  onCopyMessage,
}: GcashPaymentGuideProps) {
  const [copiedField, setCopiedField] = useState<"name" | "number" | null>(null);
  const instructions = getGuestPaymentInstructions();
  const hasDetails = Boolean(instructions.gcashAccountName || instructions.gcashNumber);

  const copyText = async (field: "name" | "number", value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      onCopyMessage?.("Copied GCash details.");
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1200);
    } catch {
      onCopyMessage?.("Unable to copy GCash details.");
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-200 bg-emerald-50/70",
        compact ? "p-3" : "p-3.5",
        className,
      )}
    >
      <p className="text-sm font-semibold text-emerald-900">Pay via GCash</p>

      {hasDetails ? (
        <div className="mt-2 grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-emerald-900">
            <p className="truncate">
              Name: <span className="font-semibold">{instructions.gcashAccountName || "-"}</span>
            </p>
            {instructions.gcashAccountName ? (
              <button
                type="button"
                onClick={() => void copyText("name", instructions.gcashAccountName)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedField === "name" ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-emerald-900">
            <p className="truncate">
              Number: <span className="font-semibold">{instructions.gcashNumber || "-"}</span>
            </p>
            {instructions.gcashNumber ? (
              <button
                type="button"
                onClick={() => void copyText("number", instructions.gcashNumber)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedField === "number" ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-emerald-800">GCash account details are not available yet. Please contact front desk support.</p>
      )}

      <p className="mt-2 text-[11px] text-emerald-800">
        {instructions.note || "After paying, enter your reference number and upload payment proof."}
      </p>
    </div>
  );
}
