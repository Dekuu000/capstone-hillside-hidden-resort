"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { useSyncEngine } from "./SyncEngineProvider";

function scopeHref(pathname: string | null): string {
  if (!pathname) return "/guest/sync";
  if (pathname.startsWith("/admin")) return "/admin/sync";
  return "/guest/sync";
}

export function OfflineStatusBanner() {
  const pathname = usePathname();
  const sync = useSyncEngine();

  if (sync.online) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Offline mode. Cached pages are available; new requests will sync when internet returns.
        </p>
        <Link
          href={scopeHref(pathname)}
          className="inline-flex h-8 items-center rounded-md border border-amber-400 bg-white px-2.5 text-xs font-semibold text-amber-900"
        >
          Open Sync Center
        </Link>
      </div>
    </div>
  );
}

