"use client";

const STEP_LABELS = [
  "Select dates",
  "Choose unit",
  "Review payment",
  "Confirm booking",
];

export function BookingStepper({ currentStep }: { currentStep: number }) {
  const clamped = Math.max(1, Math.min(4, currentStep));
  return (
    <ol
      data-testid="guest-booking-stepper"
      className="grid gap-2 sm:grid-cols-4"
      aria-label="Booking progress steps"
    >
      {STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const active = step === clamped;
        const completed = step < clamped;
        return (
          <li
            key={label}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
              active
                ? "border-[var(--color-secondary)] bg-teal-50 text-[var(--color-text)]"
                : completed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[var(--color-border)] bg-white text-[var(--color-muted)]"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                active ? "bg-[var(--color-secondary)] text-white" : "bg-slate-200 text-slate-700"
              }`}
              aria-hidden="true"
            >
              {step}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
