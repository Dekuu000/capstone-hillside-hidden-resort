"use client";

import { Cloud, CloudOff } from "lucide-react";
import { useSyncEngine } from "./SyncEngineProvider";
import { StatusPill } from "./StatusPill";

export function DataFreshnessBadge() {
  const { online, lastSyncedAt } = useSyncEngine();

  if (online) {
    return (
      <StatusPill
        label={lastSyncedAt ? `Live data - synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Live data"}
        tone="success"
        icon={<Cloud className="h-3.5 w-3.5" aria-hidden="true" />}
      />
    );
  }

  return (
    <StatusPill
      label={lastSyncedAt ? `Cached snapshot - synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Cached snapshot"}
      tone="warn"
      icon={<CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
    />
  );
}

