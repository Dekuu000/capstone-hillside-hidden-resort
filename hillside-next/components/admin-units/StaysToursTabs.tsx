"use client";

import { useState } from "react";
import { BedDouble, TreePalm } from "lucide-react";
import type { UnitListResponse } from "../../../packages/shared/src/types";
import { AdminPageHeader } from "../layout/AdminPageHeader";
import { AdminUnitsClient } from "./AdminUnitsClient";
import { AdminToursClient } from "../admin-tours/AdminToursClient";

type UnitOperationalStatus = "cleaned" | "occupied" | "maintenance" | "dirty";

type StaysToursTabsProps = {
  token: string | null;
  initialTab: "stays" | "tours";
  // Forwarded to the Stays (units) manager.
  initialData?: UnitListResponse | null;
  initialType?: string;
  initialSearch?: string;
  initialShowInactive?: boolean;
  initialPage?: number;
  initialOpenUnitId?: string | null;
  initialOperationalStatus?: UnitOperationalStatus | "";
};

const TAB_ITEMS: Array<{ id: "stays" | "tours"; label: string; Icon: typeof BedDouble }> = [
  { id: "stays", label: "Stays", Icon: BedDouble },
  { id: "tours", label: "Tours", Icon: TreePalm },
];

/**
 * Hosts the unified "Stays & Tours" back-office page: one header + a segmented
 * control switching between the units manager (Stays) and the tours manager
 * (Tours). The tab is kept in the URL (?tab=) without a full navigation so the
 * units list never refetches when toggling.
 */
export function StaysToursTabs({ token, initialTab, ...unitsProps }: StaysToursTabsProps) {
  const [tab, setTab] = useState<"stays" | "tours">(initialTab);

  const onTabChange = (next: string) => {
    const value = next === "tours" ? "tours" : "stays";
    setTab(value);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", value);
      window.history.replaceState(null, "", url);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <AdminPageHeader
        eyebrow="Inventory"
        title="Stays & Tours"
        subtitle="Manage rooms, cottages, and event spaces, plus your day and night tours."
      />

      <div
        role="group"
        aria-label="Switch between stays and tours"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)] sm:mx-auto sm:w-full sm:max-w-[420px]"
      >
        {TAB_ITEMS.map(({ id, label, Icon }) => {
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onTabChange(id)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--color-primary)] text-white shadow-sm"
                  : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "stays" ? (
        <AdminUnitsClient initialToken={token} hideHeader {...unitsProps} />
      ) : (
        <AdminToursClient accessToken={token} />
      )}
    </section>
  );
}
