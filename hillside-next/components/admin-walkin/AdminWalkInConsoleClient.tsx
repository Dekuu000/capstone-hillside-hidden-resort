"use client";

import { useMemo, useState } from "react";
import type { ServiceListResponse } from "../../../packages/shared/src/types";
import { AdminWalkInStayClient } from "../admin-walkin-stay/AdminWalkInStayClient";
import { AdminWalkInTourClient } from "../admin-walkin-tour/AdminWalkInTourClient";

type WalkInTab = "stay" | "tour";

type AdminWalkInConsoleClientProps = {
  initialToken: string;
  initialServicesData: ServiceListResponse | null;
  initialTab?: WalkInTab;
};

export function AdminWalkInConsoleClient({
  initialToken,
  initialServicesData,
  initialTab = "stay",
}: AdminWalkInConsoleClientProps) {
  const [tab, setTab] = useState<WalkInTab>(initialTab);
  const tabDescription = useMemo(() => {
    if (tab === "tour") {
      return "Create a same-day tour reservation and proceed to cashier payment.";
    }
    return "Create an on-site unit booking and proceed to cashier payment.";
  }, [tab]);

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Walk-in Console</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{tabDescription}</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)]">
        <button
          type="button"
          onClick={() => setTab("stay")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            tab === "stay"
              ? "bg-[var(--color-primary)] text-white"
              : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-background)]"
          }`}
        >
          Walk-in Stay
        </button>
        <button
          type="button"
          onClick={() => setTab("tour")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            tab === "tour"
              ? "bg-[var(--color-primary)] text-white"
              : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-background)]"
          }`}
        >
          Walk-in Tour
        </button>
      </div>

      {tab === "stay" ? (
        <AdminWalkInStayClient initialToken={initialToken} embedded />
      ) : (
        <AdminWalkInTourClient initialToken={initialToken} initialServicesData={initialServicesData} embedded />
      )}
    </section>
  );
}

