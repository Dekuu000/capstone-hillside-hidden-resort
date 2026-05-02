"use client";

import { useEffect, useState } from "react";
import { KeyRound, Mail, Save, User } from "lucide-react";
import { myProfileResponseSchema } from "../../../packages/shared/src/schemas";
import type { MyProfileResponse } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { Button } from "../shared/Button";
import { Input } from "../shared/Input";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { useToast } from "../shared/ToastProvider";

type GuestProfileClientProps = {
  accessToken: string;
  initialEmail?: string | null;
};

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function GuestProfileClient({ accessToken, initialEmail = null }: GuestProfileClientProps) {
  const { showToast } = useToast();

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileBusy, setProfileBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [emailDraft, setEmailDraft] = useState(initialEmail ?? "");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const networkOnline = useNetworkOnline();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const profile = await apiFetch<MyProfileResponse>(
          "/v2/me/profile",
          { method: "GET" },
          accessToken,
          myProfileResponseSchema,
        );
        if (cancelled) return;
        setName(profile.name?.trim() || "");
        const resolvedEmail = profile.email?.trim() || initialEmail?.trim() || "";
        setEmail(resolvedEmail);
        setEmailDraft(resolvedEmail);
      } catch (unknownError) {
        if (cancelled) return;
        setProfileError(getApiErrorMessage(unknownError, "Failed to load guest profile."));
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, initialEmail]);

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const nextProfile = await apiFetch<MyProfileResponse>(
        "/v2/me/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim() || null,
          }),
        },
        accessToken,
        myProfileResponseSchema,
      );
      setName(nextProfile.name?.trim() || "");
      showToast({ type: "success", title: "Profile saved", message: "Guest profile details updated." });
    } catch (unknownError) {
      setProfileError(getApiErrorMessage(unknownError, "Failed to save profile."));
    } finally {
      setProfileBusy(false);
    }
  };

  const updateEmail = async () => {
    const nextEmail = emailDraft.trim().toLowerCase();
    if (!nextEmail || !isLikelyEmail(nextEmail)) {
      setAccountError("Enter a valid email address.");
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setEmail(nextEmail);
      showToast({
        type: "success",
        title: "Email update requested",
        message: "Check your inbox to confirm the new email.",
      });
    } catch (unknownError) {
      setAccountError(getApiErrorMessage(unknownError, "Failed to update email."));
    } finally {
      setAccountBusy(false);
    }
  };

  const updatePassword = async () => {
    if (newPassword.length < 8) {
      setAccountError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountError("Passwords do not match.");
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      showToast({
        type: "success",
        title: "Password updated",
        message: "Your account password was changed successfully.",
      });
    } catch (unknownError) {
      setAccountError(getApiErrorMessage(unknownError, "Failed to update password."));
    } finally {
      setAccountBusy(false);
    }
  };

  if (profileLoading) {
    return (
      <section className="surface p-5">
        <div className="skeleton h-5 w-36" />
        <div className="mt-4 space-y-3">
          <div className="skeleton h-12" />
          <div className="skeleton h-10" />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {!networkOnline ? (
        <SyncAlertBanner
          message="You are offline. Profile and security updates require internet to save."
          showSyncCta
        />
      ) : null}
      <section className="surface p-5">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <User className="h-4 w-4 text-[var(--color-secondary)]" />
          Profile Settings
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Update the guest display information used in bookings.</p>
        <div className="mt-4 space-y-3">
          <Input
            id="guest-name"
            label="Name"
            placeholder="Your full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="button"
            leftSlot={<Save className="h-4 w-4" />}
            loading={profileBusy}
            disabled={!networkOnline}
            onClick={() => void saveProfile()}
            className="w-full sm:w-auto"
          >
            {networkOnline ? "Save profile" : "Reconnect to save"}
          </Button>
          <p className="text-xs text-[var(--color-muted)]">
            Wallet connect/disconnect is now available in the top-right profile menu.
          </p>
        </div>
        {profileError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{profileError}</p> : null}
      </section>

      <section className="surface p-5">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <KeyRound className="h-4 w-4 text-[var(--color-secondary)]" />
          Account Security
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Update your login email and password.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="guest-surface-soft p-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <Mail className="h-4 w-4 text-[var(--color-secondary)]" />
              Email
            </h3>
            <div className="mt-3 space-y-3">
              <Input id="guest-email" label="Email address" type="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} />
              <p className="text-xs text-[var(--color-muted)]">Current: {email || "Not set"}</p>
              <Button type="button" variant="secondary" loading={accountBusy} disabled={!networkOnline} onClick={() => void updateEmail()} className="w-full">
                {networkOnline ? "Update email" : "Reconnect to update"}
              </Button>
            </div>
          </article>

          <article className="guest-surface-soft p-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <KeyRound className="h-4 w-4 text-[var(--color-secondary)]" />
              Change password
            </h3>
            <div className="mt-3 space-y-3">
              <Input
                id="guest-password"
                label="New password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                helperText="Minimum 8 characters."
              />
              <Input
                id="guest-password-confirm"
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <Button type="button" variant="secondary" loading={accountBusy} disabled={!networkOnline} onClick={() => void updatePassword()} className="w-full">
                {networkOnline ? "Update password" : "Reconnect to update"}
              </Button>
            </div>
          </article>
        </div>
        {accountError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{accountError}</p> : null}
      </section>
    </div>
  );
}
