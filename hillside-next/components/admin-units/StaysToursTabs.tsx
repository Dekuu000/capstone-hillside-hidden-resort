"use client";

import { useState } from "react";
import { BedDouble, TreePalm } from "lucide-react";
import type { UnitListResponse } from "../../../packages/shared/src/types";
import { AdminPageHeader } from "../layout/AdminPageHeader";
import { Tabs } from "../shared/Tabs";
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

const TAB_ITEMS = [
  { id: "stays", label: "Stays", icon: <BedDouble className="h-4 w-4" /> },
  { id: "tours", label: "Tours", icon: <TreePalm className="h-4 w-4" /> },
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

      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={onTabChange}
        ariaLabel="Switch between stays and tours"
        className="sm:max-w-md sm:grid-cols-2"
      />

      {tab === "stays" ? (
        <AdminUnitsClient initialToken={token} hideHeader {...unitsProps} />
      ) : (
        <AdminToursClient accessToken={token} />
      )}
    </section>
  );
}
