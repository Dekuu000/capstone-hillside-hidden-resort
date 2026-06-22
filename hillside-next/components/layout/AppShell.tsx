import type { ReactNode } from "react";
import { AdminChrome } from "./AdminChrome";

export function AppShell({
  children,
  initialName,
  initialEmail,
  role,
}: {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
  role?: string | null;
}) {
  return (
    <AdminChrome initialName={initialName} initialEmail={initialEmail} role={role}>
      {children}
    </AdminChrome>
  );
}
