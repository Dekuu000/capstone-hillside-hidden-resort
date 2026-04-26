"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { Badge } from "./Badge";

export function NetworkStatusBadge() {
  const online = useNetworkOnline();

  return (
    <span className="inline-flex items-center gap-2">
      {online ? <Wifi className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <WifiOff className="h-4 w-4 text-amber-700" aria-hidden="true" />}
      <Badge label={online ? "Online" : "Offline mode"} variant={online ? "success" : "warn"} />
    </span>
  );
}

