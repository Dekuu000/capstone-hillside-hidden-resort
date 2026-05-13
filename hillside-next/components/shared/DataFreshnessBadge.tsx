"use client";

import { Cloud, CloudOff } from "lucide-react";
import { formatDateTime } from "../../lib/dateDisplay";
import { useSyncEngine } from "./SyncEngineProvider";
import { StatusPill } from "./StatusPill";

export function DataFreshnessBadge() {
  const { online, lastSyncedAt } = useSyncEngine();

  if (online) {
    return (
      <StatusPill
        label={
          lastSyncedAt
            ? `Live data - synced ${formatDateTime(lastSyncedAt, {
                formatOptions: { hour: "numeric", minute: "2-digit" },
              })}`
            : "Live data"
        }
        tone="success"
        icon={<Cloud className="h-3.5 w-3.5" aria-hidden="true" />}
      />
    );
  }

  return (
    <StatusPill
      label={
        lastSyncedAt
          ? `Cached snapshot - synced ${formatDateTime(lastSyncedAt, {
              formatOptions: { hour: "numeric", minute: "2-digit" },
            })}`
          : "Cached snapshot"
      }
      tone="warn"
      icon={<CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
    />
  );
}

