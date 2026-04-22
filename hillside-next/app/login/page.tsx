"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { Button } from "../../components/shared/Button";
import { Toast } from "../../components/shared/Toast";
import { AuthShell } from "../../components/layout/AuthShell";
import { GoogleIcon } from "../../components/branding/GoogleIcon";

async function syncServerSessionCookie(accessToken: string, emailValue?: string | null) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ accessToken, email: emailValue ?? null }),
  });
  if (!response.ok) {
    throw new Error("Unable to initialize server session cookie.");
  }
}

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
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "";
    const requested = new URLSearchParams(window.location.search).get("next");
    return requested && requested.startsWith("/") ? requested : "";
  });

  const resolveNextPath = async (
    requestedPath: string,
    signedInUser?: {
      user_metadata?: Record<string, unknown> | null;
    } | null,
  ) => {
    const supabase = getSupabaseBrowserClient();
    const user = signedInUser ?? (await supabase.auth.getSession()).data.session?.user;
    if (!user) return "/login";

    const safePath = requestedPath && requestedPath.startsWith("/") ? requestedPath : "";
    const metadataRole = user.user_metadata?.role;
    const metadataIsAdmin = typeof metadataRole === "string" && metadataRole.toLowerCase() === "admin";

    if (!safePath) {
      if (metadataIsAdmin) return "/admin/reservations";
      const { data: isAdmin } = await supabase.rpc("is_admin");
      return isAdmin === true ? "/admin/reservations" : "/my-bookings";
    }

    if (!safePath.startsWith("/admin")) return safePath;
    if (metadataIsAdmin) return safePath;

    const { data: isAdmin, error: isAdminError } = await supabase.rpc("is_admin");
    if (!isAdminError && isAdmin === true) return safePath;
    return "/my-bookings";
  };

  const ensureUserProfileRow = async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    const metadataRole = user.user_metadata?.role;
    const insertRole = typeof metadataRole === "string" && metadataRole.toLowerCase() === "admin" ? "admin" : "guest";
    const nameValue = (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) || user.email?.split("@")[0] || "Guest User";
    const phoneValue = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

    const { error: insertError } = await (supabase as any).from("users").upsert(
      {
        user_id: user.id,
        name: nameValue,
        email: user.email ?? null,
        phone: phoneValue,
        role: insertRole,
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
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        if (data.session?.access_token) {
          void syncServerSessionCookie(data.session.access_token, data.session.user?.email ?? null)
            .catch(() => null)
            .then(() => resolveNextPath(nextPath))
            .then((target) => {
              if (!mounted) return;
              if (target === window.location.pathname) return;
              navigateAfterAuth(target);
            });
        }
      });
    } catch (unknownError) {
      if (!mounted) return;
      setError(unknownError instanceof Error ? unknownError.message : "Failed to initialize auth.");
    }
    return () => {
      mounted = false;
    };
  }, [navigateAfterAuth, nextPath]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (!agree) {
      setBusy(false);
      setError("Please agree to the Terms and Privacy Policy before signing in.");
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (data.session?.access_token) {
        await syncServerSessionCookie(data.session.access_token, data.user?.email ?? null);
      }

      void ensureUserProfileRow().catch(() => null);
      const target = await resolveNextPath(nextPath, data.user);
      navigateAfterAuth(target);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  const onGoogleSignIn = () => {
    setError("Google sign-in is not configured yet for this environment.");
  };

  return (
    <AuthShell
      sideTitle="Welcome Back!"
      sideSubtitle=""
      sideDescription="Sign in to manage your bookings and enjoy your stay."
      sideProof="Protected by industry-standard security and encrypted connections."
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

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={agree}
            onChange={(event) => setAgree(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-secondary)] focus-visible:ring-2 focus-visible:ring-teal-200"
          />
          Remember me
        </label>

        {error ? <Toast type="error" title="Sign in failed" message={error} /> : null}

        <Button
          type="submit"
          className="h-12 w-full rounded-xl border-0 bg-[var(--color-cta)] text-base font-semibold text-white hover:brightness-95"
          loading={busy}
          disabled={!agree || !email.trim() || !password}
        >
          {busy ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <div className="mt-5 flex items-center gap-3 text-sm text-[var(--color-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span>or continue with</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="mt-8 text-center text-sm text-[var(--color-muted)]">
        Don&apos;t have an account?{" "}
        <Link href="/auth/sign-up" className="font-semibold text-[var(--color-secondary)] hover:underline">
          Sign Up
        </Link>
      </div>
    </AuthShell>
  );
}
