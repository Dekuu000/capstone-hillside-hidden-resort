"use client";

import type { ReactNode } from "react";

export function GuestSectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] transition-shadow duration-200 md:hover:shadow-[var(--shadow-md)] ${className}`.trim()}
    >
      {children}
    </article>
  );
}
