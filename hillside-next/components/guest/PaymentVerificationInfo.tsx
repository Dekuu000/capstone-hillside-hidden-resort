"use client";

import { GuestSectionCard } from "./GuestSectionCard";

const STEPS = [
  "Submit reservation details",
  "Pay via GCash",
  "Upload payment proof",
  "Admin verifies payment",
  "Booking becomes ready for check-in",
];

export function PaymentVerificationInfo() {
  return (
    <GuestSectionCard className="p-4">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">How payment verification works</h3>
      <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-muted)]">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-2">
            <span className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </GuestSectionCard>
  );
}
