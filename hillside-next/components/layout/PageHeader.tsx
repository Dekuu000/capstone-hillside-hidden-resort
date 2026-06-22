import type { ReactNode } from "react";
import { AdminPageHeader } from "./AdminPageHeader";

/**
 * Thin adapter kept for existing call sites. The single canonical back-office
 * header is AdminPageHeader; this maps the older prop names onto it so every
 * page renders the identical header block.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  statusSlot,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
  /** Accepted for backwards compatibility; no longer changes the visual style. */
  variant?: "surface" | "hero";
  className?: string;
}) {
  return (
    <AdminPageHeader
      eyebrow={typeof eyebrow === "string" ? eyebrow : undefined}
      title={title}
      subtitle={subtitle}
      action={rightSlot}
      meta={statusSlot}
    />
  );
}
