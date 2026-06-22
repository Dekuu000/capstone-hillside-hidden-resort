"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import {
  ROLE_LABELS,
  rolesCreatableBy,
  type Role,
  type TeamMember,
} from "../../../packages/shared/src/types";
import { teamListResponseSchema, teamMemberSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { Select } from "../shared/Select";

type Props = {
  accessToken: string | null;
  role: Role;
  currentUserId: string;
};

/** Short, plain-language description of what each back-office role can do. */
const ROLE_BLURB: Record<Role, string> = {
  guest: "Books and manages their own stays.",
  staff: "Front desk: walk-ins, check-in, guest services.",
  admin: "Manager: reservations, units, payments, reports.",
  super_admin: "System Admin: full access, including technical tools.",
};

function roleBadgeClass(role: Role): string {
  switch (role) {
    case "super_admin":
      return "bg-[color:color-mix(in_srgb,var(--color-cta)_14%,white)] text-[var(--color-cta)]";
    case "admin":
      return "bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]";
    default:
      return "bg-[var(--color-background)] text-[var(--color-muted)]";
  }
}

function generatePassword(): string {
  // Readable but strong: avoids ambiguous chars, guarantees variety.
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = lower + upper + digits + symbols;
  const pick = (set: string, n: number) => {
    const out: string[] = [];
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    for (let i = 0; i < n; i += 1) out.push(set[buf[i] % set.length]);
    return out;
  };
  const chars = [...pick(upper, 2), ...pick(lower, 4), ...pick(digits, 3), ...pick(symbols, 1), ...pick(all, 2)];
  // Shuffle (Fisher–Yates with crypto randomness).
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = order[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function AdminTeamClient({ accessToken, role, currentUserId }: Props) {
  const grantableRoles = useMemo(() => rolesCreatableBy(role), [role]);
  const canChangeRoles = grantableRoles.length > 1; // effectively System Admin only

  const [items, setItems] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: grantableRoles[0] ?? "staff", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/v2/admin/team", { method: "GET" }, accessToken, teamListResponseSchema);
      setItems(data.items);
    } catch (unknownError) {
      setItems([]);
      setError(getApiErrorMessage(unknownError, "Couldn't load the team."));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = useCallback(() => {
    setForm({ name: "", email: "", role: grantableRoles[0] ?? "staff", password: "" });
    setFormError(null);
    setCreatedNote(null);
    setModalOpen(true);
  }, [grantableRoles]);

  const submit = useCallback(async () => {
    if (!accessToken) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiFetch(
        "/v2/admin/team",
        { method: "POST", body: JSON.stringify(form) },
        accessToken,
        teamMemberSchema,
      );
      setItems((prev) => [...prev, created]);
      setModalOpen(false);
      setCreatedNote(
        `Account created for ${created.name || created.email}. Share the temporary password so they can sign in and change it.`,
      );
    } catch (unknownError) {
      setFormError(getApiErrorMessage(unknownError, "Couldn't create the account."));
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, form]);

  const changeRole = useCallback(
    async (member: TeamMember, nextRole: Role) => {
      if (!accessToken || nextRole === member.role) return;
      setBusyId(member.user_id);
      setError(null);
      try {
        const updated = await apiFetch(
          `/v2/admin/team/${encodeURIComponent(member.user_id)}`,
          { method: "PATCH", body: JSON.stringify({ role: nextRole }) },
          accessToken,
          teamMemberSchema,
        );
        setItems((prev) => prev.map((row) => (row.user_id === updated.user_id ? updated : row)));
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Couldn't change the role."));
      } finally {
        setBusyId(null);
      }
    },
    [accessToken],
  );

  if (!accessToken) {
    return (
      <div className="surface p-6 text-sm text-[var(--color-muted)]">
        Sign in as a Manager or System Admin to manage team accounts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          {loading ? "Loading team…" : `${items.length} ${items.length === 1 ? "account" : "accounts"}`}
          {canChangeRoles ? null : (
            <span className="ml-1">· you can add Front Desk staff</span>
          )}
        </p>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99]"
        >
          <UserPlus className="h-4 w-4" />
          Add team member
        </button>
      </div>

      {createdNote ? (
        <div className="flex items-start gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)] p-3 text-sm text-[var(--color-text)]" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
          <span>{createdNote}</span>
          <button type="button" onClick={() => setCreatedNote(null)} className="ml-auto shrink-0 text-[var(--color-muted)] hover:text-[var(--color-text)]" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`team-skeleton-${i}`} className="surface flex items-center gap-3 p-4">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="surface p-10 text-center text-sm text-[var(--color-muted)]">
          No team accounts yet. Use “Add team member” to create one.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((member) => {
            const memberRole = member.role as Role;
            const isSelf = member.user_id === currentUserId;
            const initial = (member.name || member.email || "?").trim().charAt(0).toUpperCase();
            return (
              <li key={member.user_id} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-[var(--color-text)]">
                      {member.name || "Unnamed"}
                      {isSelf ? (
                        <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]">You</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{member.email || "No email"}</p>
                    <p className="mt-0.5 hidden text-xs text-[var(--color-muted)] sm:block">{ROLE_BLURB[memberRole]}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canChangeRoles && !isSelf ? (
                    <div className="w-44">
                      <Select
                        value={member.role}
                        onChange={(value) => void changeRole(member, value as Role)}
                        options={grantableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                        ariaLabel={`Change role for ${member.name || member.email}`}
                        align="end"
                        disabled={busyId === member.user_id}
                      />
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${roleBadgeClass(memberRole)}`}>
                      {memberRole === "super_admin" ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                      {ROLE_LABELS[memberRole]}
                    </span>
                  )}
                  {busyId === member.user_id ? <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add team member">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Add team member</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-background)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Full name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Dela Cruz"
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@hillside.ph"
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                />
              </label>

              <div className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Role</span>
                {grantableRoles.length > 1 ? (
                  <Select
                    value={form.role}
                    onChange={(value) => setForm((f) => ({ ...f, role: value as Role }))}
                    options={grantableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                    ariaLabel="Role for the new account"
                  />
                ) : (
                  <p className="flex h-11 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-semibold text-[var(--color-text)]">
                    {ROLE_LABELS[(grantableRoles[0] ?? "staff") as Role]}
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--color-muted)]">{ROLE_BLURB[(form.role as Role) ?? "staff"]}</p>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Temporary password</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="At least 8 characters"
                    autoComplete="off"
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 font-mono text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
                    className="h-11 shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-secondary)] transition hover:bg-[var(--color-background)]"
                  >
                    Generate
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">The new member signs in with this, then changes it.</p>
              </label>

              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700" role="alert">{formError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-11 flex-1 rounded-xl border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !form.name.trim() || !form.email.trim() || form.password.length < 8}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {submitting ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
