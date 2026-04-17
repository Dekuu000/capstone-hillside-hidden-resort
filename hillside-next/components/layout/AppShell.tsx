import type { ReactNode } from "react";
import { AdminChrome } from "./AdminChrome";

export function AppShell({
  children,
  initialName,
  initialEmail,
}: {
  children: ReactNode;
  initialName?: string | null;
  initialEmail?: string | null;
}) {
  return (
    <AdminChrome initialName={initialName} initialEmail={initialEmail}>
      {children}
    </AdminChrome>
  );
}
