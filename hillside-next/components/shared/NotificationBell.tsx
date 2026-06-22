"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X } from "lucide-react";
import type { NotificationItem } from "../../../packages/shared/src/types";
import {
  notificationListResponseSchema,
  notificationMarkReadResponseSchema,
  notificationUnreadCountResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { safeGetSession } from "../../lib/supabase";

const POLL_MS = 60_000;

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-[var(--color-secondary)]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Header notifications bell + panel. Self-contained: fetches its own session
 * token, polls the unread count, and loads the list on open. Degrades silently
 * (no badge, empty panel) on any error — so it is safe before the notifications
 * table exists online.
 */
export function NotificationBell({
  light = false,
  placement = "bottom-end",
}: {
  light?: boolean;
  /** Desktop popover direction: "bottom-end" (top-bar bells) or "top-start" (sidebar-footer bell). */
  placement?: "bottom-end" | "top-start";
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void safeGetSession().then(({ session }) => {
      if (mounted) setToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch(
        "/v2/notifications/unread-count",
        { method: "GET" },
        token,
        notificationUnreadCountResponseSchema,
      );
      setUnread(data.unread_count);
    } catch {
      // table missing / offline / unauthorized → treat as no notifications
      setUnread(0);
    }
  }, [token]);

  const loadList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        "/v2/notifications?limit=20",
        { method: "GET" },
        token,
        notificationListResponseSchema,
      );
      setItems(data.items);
      setUnread(data.unread_count);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Poll the unread count + refresh on focus.
  useEffect(() => {
    if (!token) return;
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), POLL_MS);
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, refreshCount]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      const data = await apiFetch(
        "/v2/notifications/mark-read",
        { method: "POST", body: JSON.stringify({ all: true }) },
        token,
        notificationMarkReadResponseSchema,
      );
      setUnread(data.unread_count);
      setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    } catch {
      /* no-op */
    }
  };

  const openItem = async (item: NotificationItem) => {
    if (token && !item.read_at) {
      void apiFetch(
        "/v2/notifications/mark-read",
        { method: "POST", body: JSON.stringify({ notification_ids: [item.notification_id] }) },
        token,
        notificationMarkReadResponseSchema,
      )
        .then((data) => setUnread(data.unread_count))
        .catch(() => undefined);
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  if (!token) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] ${
          light
            ? "text-white hover:bg-white/15"
            : "text-[var(--color-text)] hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
        }`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Mobile backdrop so the panel reads as a sheet (desktop uses a popover). */}
          <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            className={`fixed inset-x-3 top-[74px] z-50 overflow-hidden whitespace-normal rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] sm:absolute sm:inset-x-auto sm:top-auto sm:w-[360px] ${
              placement === "top-start"
                ? "sm:bottom-full sm:left-0 sm:mb-2"
                : "sm:top-full sm:right-0 sm:mt-2"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--color-text)]">Notifications</p>
              <div className="flex items-center gap-3">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-secondary)] hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-background)] sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto overflow-x-hidden">
            {loading && items.length === 0 ? (
              <div className="space-y-2 p-3">
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-12 w-full" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                You&rsquo;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {items.map((item) => (
                  <li key={item.notification_id}>
                    <button
                      type="button"
                      onClick={() => void openItem(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-background)] ${
                        item.read_at ? "" : "bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)]"
                      }`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.info}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--color-text)]">{item.title}</span>
                          <span className="shrink-0 text-[11px] text-[var(--color-muted)]">{relativeTime(item.created_at)}</span>
                        </span>
                        {item.body ? <span className="mt-0.5 block break-words text-xs leading-relaxed text-[var(--color-muted)]">{item.body}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
