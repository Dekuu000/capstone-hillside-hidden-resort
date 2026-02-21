"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            phone: phone.trim() || null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // If email confirmation is disabled in Supabase, signUp can create a live session.
      // We force a clean login flow by clearing client/server sessions before redirecting.
      if (signUpData.session?.access_token) {
        await supabase.auth.signOut();
        await fetch("/api/auth/session", { method: "DELETE" });
      }

      setSuccess("Account created. Redirecting to login...");
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to create account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eff6ff] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1e3a8a]/10 text-2xl text-[#1e3a8a]">＋</div>
          <h1 className="text-3xl font-bold text-[#1e3a8a]">Create Account</h1>
          <p className="mt-1 text-sm text-slate-600">Join Hillside Hidden Resort</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Full Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              placeholder="Juan Dela Cruz"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Mobile Number <span className="text-slate-400">(optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              placeholder="09123456789"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              placeholder="At least 6 characters"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a8a] focus:ring-4 focus:ring-[#1e3a8a]/20"
              placeholder="Re-type password"
              required
            />
          </label>

          {success ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-[#f97316] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#1e3a8a] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
