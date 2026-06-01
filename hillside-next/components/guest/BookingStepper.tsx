"use client";

type BookingStepperProps = {
  currentStep: number;
  steps?: string[];
};

const DEFAULT_STEP_LABELS = ["Dates", "Units", "Confirm"];

export function BookingStepper({ currentStep, steps = DEFAULT_STEP_LABELS }: BookingStepperProps) {
  const stepLabels = steps.length > 0 ? steps : DEFAULT_STEP_LABELS;
  const clamped = Math.max(1, Math.min(stepLabels.length, currentStep));
  return (
    <ol
      data-testid="booking-stepper"
      className={`grid gap-2 text-center ${stepLabels.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"}`}
      aria-label="Booking progress steps"
    >
      {stepLabels.map((label, index) => {
        const step = index + 1;
        const active = step === clamped;
        const completed = step < clamped;
        return (
          <li
            key={label}
            className={`flex h-10 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition-colors ${
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm"
                : completed
                  ? "border-slate-200 bg-white text-slate-700"
                  : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                active
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
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
