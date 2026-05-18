"use client";

import type { ReactNode } from "react";

export function GuestPageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`mx-auto w-full max-w-6xl ${className}`.trim()}>{children}</section>;
}
