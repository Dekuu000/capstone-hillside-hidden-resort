"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { getApiErrorMessage } from "../../lib/apiError";
import { clearOfflineUserData, setServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { resolveUserProfileName } from "../../lib/userProfile";
import { Button } from "../../components/shared/Button";
import { Toast } from "../../components/shared/Toast";
import { AuthShell } from "../../components/layout/AuthShell";
import { isBackOffice } from "../../../packages/shared/src/types";

const AUTO_BOOTSTRAP_GUARD_KEY = "hs_login_auto_bootstrap_target";

function AuthInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
  autoComplete,
  required,
  rightSlot,
}: {
  label?: string;
  type: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  icon: ReactNode;
  autoComplete?: string;
  required?: boolean;
  rightSlot?: ReactNode;
}) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{label}</span> : null}
      <span className="flex h-12 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 shadow-[var(--shadow-sm)] transition focus-within:border-[var(--color-secondary)] focus-within:ring-2 focus-within:ring-teal-100">
        <span className="text-[var(--color-muted)]">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          className="h-full w-full border-0 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
        />
        {rightSlot}
      </span>
    </label>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const hasSessionBootstrapRun = useRef(false);
  const navigateAfterAuth = useCallback(
    (target: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
      router.replace(target);
    },
    [router],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "";
    const requested = new URLSearchParams(window.location.search).get("next");
    return requested && requested.startsWith("/") ? requested : "";
  });

  // Authoritative role from the API auth context (includes Front Desk/staff,
  // which the is_admin RPC does not). Falls back to "guest" on any failure.
  const resolveBackOfficeRole = async (): Promise<string> => {
    try {
      const { session } = await safeGetSession();
      const token = session?.access_token;
      const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
      if (!token || !base) return "guest";
      const response = await fetch(`${base}/v2/auth/context`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return "guest";
      const ctx = (await response.json()) as { role?: string };
      return String(ctx?.role || "guest").toLowerCase();
    } catch {
      return "guest";
    }
  };

  const resolveNextPath = async (requestedPath: string) => {
    const safePath = requestedPath && requestedPath.startsWith("/") ? requestedPath : "";
    const role = await resolveBackOfficeRole();
    const backOffice = isBackOffice(role);
    // All back-office roles land on the dashboard (Front Desk sees the operations
    // cockpit, Manager/System Admin the full view); guests on their trips.
    const home = backOffice ? "/admin" : "/my-bookings";
    if (!safePath) return home;
    if (!safePath.startsWith("/admin")) return safePath;
    return backOffice ? safePath : "/my-bookings";
  };

  const verifyApiAuthContext = async (accessToken: string): Promise<boolean> => {
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!base || !accessToken) return false;
    try {
      const response = await fetch(`${base}/v2/auth/context`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const ensureUserProfileRow = async () => {
    const supabase = getSupabaseBrowserClient();
    const { session } = await safeGetSession();
    const user = session?.user;
    if (!user) return;

    const nameValue = resolveUserProfileName(user, "Guest User");
    const phoneValue = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

    // NOTE: do not write `role` here. The role is owned server-side (handle_new_user
    // sets the default; back-office roles are seeded by a System Admin). Sending it
    // would clobber a seeded staff/super_admin back to guest on every login.
    const { error: insertError } = await (supabase as any).from("users").upsert(
      {
        user_id: user.id,
        name: nameValue,
        email: user.email ?? null,
        phone: phoneValue,
      },
      {
        onConflict: "user_id",
      },
    );

    if (!insertError) return;
    const errorCode = String((insertError as { code?: string } | null)?.code || "");
    const message = (insertError.message || "").toLowerCase();
    const duplicate = errorCode === "23505" || message.includes("duplicate") || message.includes("already exists") || message.includes("unique");
    if (duplicate) return;
    throw insertError;
  };

  useEffect(() => {
    if (hasSessionBootstrapRun.current) return;
    hasSessionBootstrapRun.current = true;

    let mounted = true;
    try {
      const supabase = getSupabaseBrowserClient();
      safeGetSession().then(({ session }) => {
        if (!mounted) return;
        if (session?.access_token) {
          const guardTarget = nextPath || "__default__";
          const previousAttempt = window.sessionStorage.getItem(AUTO_BOOTSTRAP_GUARD_KEY);
          if (previousAttempt === guardTarget) {
            return;
          }
          window.sessionStorage.setItem(AUTO_BOOTSTRAP_GUARD_KEY, guardTarget);
          void (async () => {
            try {
              const [cookieReady, valid, target] = await Promise.all([
                setServerSessionCookie(session.access_token, session.user?.email ?? null)
                  .then(() => true)
                  .catch(() => false),
                verifyApiAuthContext(session.access_token),
                resolveNextPath(nextPath),
              ]);
              if (!cookieReady || !valid) {
                await supabase.auth.signOut().catch(() => null);
                await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
                if (!mounted) return;
                setError(
                  cookieReady
                    ? "Session is stale or API is unavailable. Please sign in again."
                    : "Unable to initialize your browser session. Please sign in again.",
                );
                return;
              }
              if (!mounted) return;
              if (target === window.location.pathname) return;
              navigateAfterAuth(target);
            } catch (unknownError) {
              if (!mounted) return;
              setError(getApiErrorMessage(unknownError, "Failed to initialize auth."));
            }
          })();
        }
      });
    } catch (unknownError) {
      if (!mounted) return;
      setError(getApiErrorMessage(unknownError, "Failed to initialize auth."));
    }
    return () => {
      mounted = false;
    };
    // resolveNextPath is stable (no reactive deps); effect intentionally runs on mount/nextPath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateAfterAuth, nextPath]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    window.sessionStorage.removeItem(AUTO_BOOTSTRAP_GUARD_KEY);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(
          getApiErrorMessage(signInError, "Login failed.", {
            network: "Cannot reach authentication service. Ensure local Supabase is running, then retry.",
          }),
        );
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setError("Signed in, but no browser session was returned. Please try again.");
        return;
      }

      const [cookieReady, valid, target] = await Promise.all([
        setServerSessionCookie(accessToken, data.user?.email ?? null)
          .then(() => true)
          .catch(() => false),
        verifyApiAuthContext(accessToken),
        resolveNextPath(nextPath),
      ]);

      if (!cookieReady || !valid) {
        await supabase.auth.signOut().catch(() => null);
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
        setError(
          cookieReady
            ? "Signed in, but API auth validation failed. Check API server and env values."
            : "Signed in, but the browser session could not be initialized. Please try again.",
        );
        return;
      }

      // Shared-device safety: if a DIFFERENT user previously used this browser
      // (e.g. a session that ended without a clean sign-out), wipe their leftover
      // offline data so accounts never bleed together.
      try {
        const newUid = data.user?.id ?? null;
        const prevUid = window.localStorage.getItem("hs_last_uid");
        if (newUid && prevUid && prevUid !== newUid) {
          await clearOfflineUserData();
        }
        if (newUid) window.localStorage.setItem("hs_last_uid", newUid);
      } catch {
        /* best-effort */
      }

      void ensureUserProfileRow().catch(() => null);
      navigateAfterAuth(target);
    } catch (unknownError) {
      setError(
        getApiErrorMessage(unknownError, "Login failed.", {
          network: "Cannot reach authentication service. Ensure local Supabase is running, then retry.",
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      fullScreen
      sideTitle="Welcome Back!"
      sideSubtitle=""
      sideDescription="Sign in to manage your bookings and enjoy your stay."
      sideImageUrl="/branding/hero-hillside-mobile.png"
      sideImagePosition="center top"
      mobileBrandLine="Welcome back"
      formIntro="Sign in"
      formTitle="Sign In"
      formSubtitle="Enter your credentials to continue"
      sideQuote={undefined}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <AuthInput
          type="email"
          label="Email Address"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          placeholder="Enter your email"
          icon={<Mail className="h-4 w-4" />}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text)]">Password</span>
            <Link href="/auth/forgot-password" className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
              Forgot Password?
            </Link>
          </div>
          <AuthInput
            type={showPassword ? "text" : "password"}
            label=""
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            icon={<Lock className="h-4 w-4" />}
            rightSlot={
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-md p-1 text-[var(--color-muted)] hover:bg-slate-100">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </div>

        {error ? <Toast type="error" title="Sign in failed" message={error} /> : null}

        <Button
          type="submit"
          className="h-12 w-full rounded-xl border-0 bg-[var(--color-cta)] text-base font-semibold text-white hover:brightness-95"
          loading={busy}
          disabled={busy}
        >
          {busy ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <div className="mt-8 text-center text-sm text-[var(--color-muted)]">
        Don&apos;t have an account?{" "}
        <Link href="/auth/sign-up" className="font-semibold text-[var(--color-secondary)] hover:underline">
          Sign Up
        </Link>
      </div>

    </AuthShell>
  );
}
