"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { getApiErrorMessage } from "../../lib/apiError";
import { clearServerSessionCookie } from "../../lib/authSessionCookie";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { Button } from "../../components/shared/Button";
import { Toast } from "../../components/shared/Toast";
import { AuthShell } from "../../components/layout/AuthShell";
import { TermsModal } from "../../components/legal/TermsModal";

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
  helper,
  error,
  success,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  icon: ReactNode;
  autoComplete?: string;
  required?: boolean;
  rightSlot?: ReactNode;
  helper?: string;
  error?: string;
  success?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <span
        className={`flex h-12 items-center gap-3 rounded-xl border bg-white px-3 shadow-[var(--shadow-sm)] transition focus-within:ring-2 ${
          error
            ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-100"
            : success
              ? "border-emerald-300 focus-within:border-emerald-400 focus-within:ring-emerald-100"
              : "border-[var(--color-border)] focus-within:border-[var(--color-secondary)] focus-within:ring-teal-100"
        }`}
      >
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
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
      {!error && success ? <span className="mt-1 block text-xs text-emerald-600">{success}</span> : null}
      {!error && !success && helper ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{helper}</span> : null}
    </label>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const passwordTooShort = password.length > 0 && password.length < 8;
  const confirmHasValue = confirmPassword.length > 0;
  const passwordMismatch = confirmHasValue && password !== confirmPassword;
  const passwordMatch = confirmHasValue && password === confirmPassword && !passwordTooShort;
  const fullName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please provide first name and last name.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!agree) {
      setError("Please review and accept the Terms, Privacy & Cancellation policies to continue.");
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
            name: fullName,
            phone: phone.trim() || null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (signUpData.session?.access_token) {
        await supabase.auth.signOut();
        await clearServerSessionCookie();
      }

      setSuccess("Account created. Check your email for verification, then sign in.");
      window.setTimeout(() => {
        router.replace("/auth/sign-in");
      }, 1200);
    } catch (unknownError) {
      setError(getApiErrorMessage(unknownError, "Failed to create account."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      fullScreen
      sideTitle="Create Your Account"
      sideSubtitle=""
      sideDescription="Start your journey to a relaxing and memorable stay."
      formIntro="Sign up"
      formTitle="Sign Up"
      formSubtitle="Create an account to get started"
      sideQuote="The easiest booking experience ever! QR check-in was so convenient."
      sideCaption="Maria Santos - Manila, Philippines"
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AuthInput
            type="text"
            label="First Name"
            value={firstName}
            onChange={setFirstName}
            placeholder="First name"
            icon={<UserRound className="h-4 w-4" />}
            required
          />
          <AuthInput
            type="text"
            label="Last Name"
            value={lastName}
            onChange={setLastName}
            placeholder="Last name"
            icon={<UserRound className="h-4 w-4" />}
            required
          />
        </div>

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

        <AuthInput
          type="tel"
          label="Mobile Number"
          value={phone}
          onChange={setPhone}
          placeholder="09XXXXXXXXX"
          icon={<UserRound className="h-4 w-4" />}
          helper="Optional"
        />

        <AuthInput
          type={showPassword ? "text" : "password"}
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          placeholder="Create a password"
          icon={<Lock className="h-4 w-4" />}
          helper="Minimum 8 characters with letters and numbers"
          error={passwordTooShort ? "Password must be at least 8 characters." : undefined}
          rightSlot={
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-md p-1 text-[var(--color-muted)] hover:bg-slate-100">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <AuthInput
          type={showConfirmPassword ? "text" : "password"}
          label="Confirm Password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          required
          placeholder="Re-type password"
          icon={<Lock className="h-4 w-4" />}
          error={passwordMismatch ? "Passwords do not match." : undefined}
          success={passwordMatch ? "Passwords match." : undefined}
          rightSlot={
            <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="rounded-md p-1 text-[var(--color-muted)] hover:bg-slate-100">
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {/* Consent can only be granted by reviewing all three policies in the modal. */}
        <div className="flex items-start gap-2 text-sm">
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
              agree
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-[var(--color-border)] text-transparent"
            }`}
          >
            ✓
          </span>
          <p className={agree ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>
            {agree
              ? "You’ve reviewed and accepted the "
              : "To create an account, please review and accept the "}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-left font-semibold text-[var(--color-secondary)] underline-offset-2 hover:underline"
            >
              Terms &amp; Conditions, Privacy Policy &amp; Cancellation Policy
            </button>
            .
          </p>
        </div>

        {success ? <Toast type="success" title={success} /> : null}
        {error ? <Toast type="error" title="Registration failed" message={error} /> : null}

        <Button
          type="submit"
          className="h-12 w-full rounded-xl border-0 bg-[var(--color-cta)] text-base font-semibold text-white hover:brightness-95"
          loading={busy}
          disabled={busy || !agree}
        >
          {busy ? "Creating account..." : "Create Account"}
        </Button>
      </form>

      <div className="mt-8 text-center text-sm text-[var(--color-muted)]">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-[var(--color-secondary)] hover:underline">
          Sign In
        </Link>
      </div>

      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} onAgree={() => setAgree(true)} />
    </AuthShell>
  );
}
