"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";

export function NetworkStatusBadge() {
  const online = useNetworkOnline();

  return (
    <span
      data-testid="sync-status-pill"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${online ? "text-emerald-700" : "text-amber-700"}`}
    >
      {online ? <Wifi className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <WifiOff className="h-4 w-4 text-amber-700" aria-hidden="true" />}
      {online ? "Online" : "Offline mode"}
    </span>
  );
}

