"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

async function syncServerSessionCookie(accessToken: string, emailValue?: string | null) {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, email: emailValue ?? null }),
  });
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState("");

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
    const nameValue =
      (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
      user.email?.split("@")[0] ||
      "Guest User";
    const phoneValue = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

    const { error: insertError } = await (supabase as any).from("users").insert(
      {
        user_id: user.id,
        name: nameValue,
        email: user.email ?? null,
        phone: phoneValue,
        role: insertRole,
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: true,
      },
    );

    if (!insertError) return;
    const errorCode = String((insertError as { code?: string } | null)?.code || "");
    const message = (insertError.message || "").toLowerCase();
    const duplicate =
      errorCode === "23505" ||
      message.includes("duplicate") ||
      message.includes("already exists") ||
      message.includes("unique");
    if (duplicate) return;
    throw insertError;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("next");
    setNextPath(requested && requested.startsWith("/") ? requested : "");
  }, []);

  useEffect(() => {
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
              router.replace(target);
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
  }, [nextPath, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
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

      // Best-effort profile bootstrap should not block redirect.
      void ensureUserProfileRow().catch(() => null);
      const target = await resolveNextPath(nextPath, data.user);
      router.replace(target);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eff6ff] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1e3a8a]/10 text-2xl text-[#1e3a8a]">→</div>
          <h1 className="text-3xl font-bold text-[#1e3a8a]">Welcome Back</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to Hillside Hidden Resort</p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-[#f97316] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-[#1e3a8a] hover:underline">
            Sign up
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
          <Link href="/my-bookings" className="hover:underline">
            My Bookings
          </Link>
          <Link href="/admin/reservations" className="hover:underline">
            Admin Reservations
          </Link>
        </div>
      </div>
    </main>
  );
}
