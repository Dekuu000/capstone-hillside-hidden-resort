"use client";

import { Cloud, CloudOff } from "lucide-react";
import { formatDateTime } from "../../lib/dateDisplay";
import { cn } from "../../lib/cn";
import { useSyncEngine } from "./SyncEngineProvider";
import { StatusPill } from "./StatusPill";

export function DataFreshnessBadge({ variant = "pill" }: { variant?: "pill" | "plain" }) {
  const { online, lastSyncedAt } = useSyncEngine();

  const time = lastSyncedAt
    ? formatDateTime(lastSyncedAt, { formatOptions: { hour: "numeric", minute: "2-digit" } })
    : null;
  const label = online
    ? time
      ? `Live data · synced ${time}`
      : "Live data"
    : time
      ? `Cached · synced ${time}`
      : "Cached snapshot";
  const Icon = online ? Cloud : CloudOff;

  // Plain: no pill chrome — just a small icon + label, for tucking into a corner.
  if (variant === "plain") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", online ? "text-emerald-600" : "text-amber-600")}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        {label}
      </span>
    );
  }

  return <StatusPill label={label} tone={online ? "success" : "warn"} icon={<Icon className="h-3.5 w-3.5" aria-hidden="true" />} />;
}
