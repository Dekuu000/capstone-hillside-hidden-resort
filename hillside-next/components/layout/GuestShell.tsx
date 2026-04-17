import type { ReactNode } from "react";
import { GuestChrome } from "./GuestChrome";

export function GuestShell({
  children,
  initialName,
  initialEmail,
}: {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
}) {
  return (
    <GuestChrome initialName={initialName} initialEmail={initialEmail}>
      {children}
    </GuestChrome>
  );
}
