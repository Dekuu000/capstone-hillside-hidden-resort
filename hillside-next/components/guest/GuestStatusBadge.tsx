import { StatusPill } from "../shared/StatusPill";

type Tone = "success" | "warn" | "error" | "info" | "neutral";

"use client";

export function GuestStatusBadge({
  label,
  tone = "info",
  testId,
}: {
  label: string;
  tone?: Tone;
  testId?: string;
}) {
  return (
    <span data-testid={testId}>
      <StatusPill label={label} tone={tone} />
    </span>
  );
}
