"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { env } from "../lib/env";

type SessionState = {
  hasSession: boolean;
  userId: string | null;
  email: string | null;
  error: string | null;
};

type ApiHealth = {
  ok: boolean;
  service?: string;
  env?: string;
  api_version?: string;
};

export function SessionAndApiStatus() {
  const [sessionState, setSessionState] = useState<SessionState>({
    hasSession: false,
    userId: null,
    email: null,
    error: null,
  });
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const apiHealthUrl = useMemo(() => {
    if (!env.apiBaseUrl) return null;
    return `${env.apiBaseUrl.replace(/\/+$/, "")}/health`;
  }, []);

  useEffect(() => {
    let mounted = true;
    try {
      const client = getSupabaseBrowserClient();
      client.auth
        .getSession()
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error) {
            setSessionState((prev) => ({ ...prev, error: error.message }));
            return;
          }
          const session = data.session;
          setSessionState({
            hasSession: !!session,
            userId: session?.user.id ?? null,
            email: session?.user.email ?? null,
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (!mounted) return;
          setSessionState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Failed to read session.",
          }));
        });
    } catch (error) {
      if (!mounted) return;
      setSessionState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Supabase client init failed.",
      }));
    }

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!apiHealthUrl) return;

    fetch(apiHealthUrl)
      .then(async (response) => {
        if (!mounted) return;
        if (!response.ok) {
          const body = await response.text();
          setApiError(`HTTP ${response.status}: ${body}`);
          return;
        }
        const data = (await response.json()) as ApiHealth;
        setApiHealth(data);
        setApiError(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setApiError(error instanceof Error ? error.message : "Health check failed.");
      });

    return () => {
      mounted = false;
    };
  }, [apiHealthUrl]);

  return (
    <section className="status-grid">
      <article className="status-card">
        <h2>Supabase Session Status</h2>
        <p>
          Connected to: <code>{env.supabaseUrl || "missing NEXT_PUBLIC_SUPABASE_URL"}</code>
        </p>
        <p>Authenticated: {sessionState.hasSession ? "yes" : "no"}</p>
        <p>User ID: {sessionState.userId ?? "-"}</p>
        <p>Email: {sessionState.email ?? "-"}</p>
        {sessionState.error ? <p className="error">Error: {sessionState.error}</p> : null}
      </article>

      <article className="status-card">
        <h2>FastAPI Health</h2>
        <p>
          Endpoint: <code>{apiHealthUrl ?? "missing NEXT_PUBLIC_API_BASE_URL"}</code>
        </p>
        <p>Status: {apiHealth?.ok ? "healthy" : "unknown"}</p>
        <p>Service: {apiHealth?.service ?? "-"}</p>
        <p>Environment: {apiHealth?.env ?? "-"}</p>
        <p>API Version: {apiHealth?.api_version ?? "-"}</p>
        {apiError ? <p className="error">Error: {apiError}</p> : null}
      </article>
    </section>
  );
}
