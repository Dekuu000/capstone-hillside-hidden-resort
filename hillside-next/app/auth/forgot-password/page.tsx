"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../../lib/supabase";
import { AuthShell } from "../../../components/layout/AuthShell";
import { Input } from "../../../components/shared/Input";
import { Button } from "../../../components/shared/Button";
import { Toast } from "../../../components/shared/Toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/sign-in`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to send reset link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      showSidePanel={false}
      sideTitle="Need account recovery?"
      sideSubtitle="Hidden Resort"
      sideDescription="Reset your password securely and return to operations in minutes."
      sideProof="Only registered staff and guests can request access recovery."
      mobileBrandLine="Account Recovery"
      formIntro="Password recovery"
      formTitle="Reset your password"
      formSubtitle="Enter your account email and we will send a secure reset link."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          type="email"
          label="Email Address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
        />

        {sent ? <Toast type="success" title="Reset link sent" message="Check your inbox and follow the secure reset instructions." /> : null}
        {error ? <Toast type="error" title="Reset failed" message={error} /> : null}

        <Button type="submit" className="w-full" loading={busy} disabled={!email}>
          {busy ? "Sending link..." : "Send reset link"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-[var(--color-muted)]">
        Remembered your password?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-[var(--color-primary)] hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
