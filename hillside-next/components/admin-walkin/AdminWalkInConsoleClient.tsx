"use client";

import { useMemo, useState } from "react";
import { BedDouble, TreePalm } from "lucide-react";
import type { ServiceListResponse } from "../../../packages/shared/src/types";
import { AdminPageHeader } from "../layout/AdminPageHeader";
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
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader eyebrow="Operations" title="Walk-in console" subtitle={tabDescription} />

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)] sm:mx-auto sm:w-full sm:max-w-[420px]">
        <button
          type="button"
          onClick={() => setTab("stay")}
          aria-pressed={tab === "stay"}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            tab === "stay"
              ? "bg-[var(--color-primary)] text-white shadow-sm"
              : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-background)]"
          }`}
        >
          <BedDouble className="h-4 w-4" />
          Walk-in Stay
        </button>
        <button
          type="button"
          onClick={() => setTab("tour")}
          aria-pressed={tab === "tour"}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            tab === "tour"
              ? "bg-[var(--color-primary)] text-white shadow-sm"
              : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-background)]"
          }`}
        >
          <TreePalm className="h-4 w-4" />
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


