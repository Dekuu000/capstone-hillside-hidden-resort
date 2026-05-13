"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { env } from "../../lib/env";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { onSyncEvent, runSyncCycle, startSyncLoop } from "../../lib/offlineSync/engine";
import { getSyncState, listConflicts, listOutboxSummary, type SyncScope } from "../../lib/offlineSync/store";

type SyncRuntimeState = {
  enabled: boolean;
  online: boolean;
  queued: number;
  syncing: number;
  failed: number;
  applied: number;
  conflicts: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  runNow: () => Promise<void>;
};

const defaultState: SyncRuntimeState = {
  enabled: env.syncEnabled,
  online: true,
  queued: 0,
  syncing: 0,
  failed: 0,
  applied: 0,
  conflicts: 0,
  lastSyncedAt: null,
  lastError: null,
  runNow: async () => undefined,
};

const SyncEngineContext = createContext<SyncRuntimeState>(defaultState);

export function SyncEngineProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<SyncRuntimeState>(defaultState);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const scope: SyncScope = useMemo(
    () => (pathname?.startsWith("/admin") ? "admin" : "me"),
    [pathname],
  );

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted) return;
      setAccessToken(session?.access_token ?? null);
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAccessToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => accessToken, [accessToken]);

  const refreshState = useCallback(async () => {
    if (typeof window === "undefined") return;
    const [outbox, conflicts, syncState] = await Promise.all([
      listOutboxSummary(),
      listConflicts(50),
      getSyncState(scope),
    ]);
    setSnapshot((previous) => ({
      ...previous,
      enabled: env.syncEnabled,
      online: navigator.onLine,
      queued: outbox.queued,
      syncing: outbox.syncing,
      failed: outbox.failed,
      applied: outbox.applied,
      conflicts: conflicts.length,
      lastSyncedAt: syncState.last_synced_at,
      lastError: syncState.last_error,
    }));
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stop = startSyncLoop({
      getAccessToken,
      getScope: () => scope,
      onError: async (error) => {
        setSnapshot((previous) => ({
          ...previous,
          lastError: error.message,
        }));
        await refreshState();
      },
    });

    const detach = onSyncEvent(() => {
      void refreshState();
    });
    const timer = window.setInterval(() => {
      void refreshState();
    }, 4000);

    const syncOnlineState = () => {
      setSnapshot((previous) => ({ ...previous, online: navigator.onLine }));
    };
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    void refreshState();

    return () => {
      stop();
      detach();
      window.clearInterval(timer);
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, [getAccessToken, refreshState, scope]);

  const value = useMemo<SyncRuntimeState>(() => {
    const runNow = async () => {
      const token = await getAccessToken();
      if (!token) return;
      await runSyncCycle(token, scope);
      await refreshState();
    };
    return {
      ...snapshot,
      runNow,
    };
  }, [getAccessToken, refreshState, scope, snapshot]);

  return <SyncEngineContext.Provider value={value}>{children}</SyncEngineContext.Provider>;
}

export function useSyncEngine() {
  return useContext(SyncEngineContext);
}
