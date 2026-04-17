"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "./Badge";

export function NetworkStatusBadge() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2">
      {online ? <Wifi className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <WifiOff className="h-4 w-4 text-amber-700" aria-hidden="true" />}
      <Badge label={online ? "Online" : "Offline mode"} variant={online ? "success" : "warn"} />
    </span>
  );
}

