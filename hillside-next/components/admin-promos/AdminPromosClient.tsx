"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Tag, X } from "lucide-react";
import type { CreatePromoRequest, PromoCode, PromoDiscountType } from "../../../packages/shared/src/types";
import { promoCodeSchema, promoListResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { Select } from "../shared/Select";
import { DatePicker } from "../shared/DatePicker";

function discountSummary(p: PromoCode): string {
  if (p.discount_type === "percent") {
    const cap = p.max_discount ? ` · max ${formatPhpPeso(p.max_discount)}` : "";
    return `${p.discount_value}% off${cap}`;
  }
  return `${formatPhpPeso(p.discount_value)} off`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function windowLabel(p: PromoCode): string {
  if (p.starts_at && p.ends_at) return `${formatDate(p.starts_at)} – ${formatDate(p.ends_at)}`;
  if (p.ends_at) return `Until ${formatDate(p.ends_at)}`;
  if (p.starts_at) return `From ${formatDate(p.starts_at)}`;
  return "No expiry";
}

const EMPTY_FORM = {
  code: "",
  description: "",
  discount_type: "percent" as PromoDiscountType,
  discount_value: "",
  max_discount: "",
  min_total: "",
  usage_limit: "",
  per_user_limit: "",
  starts_at: "",
  ends_at: "",
  auto_apply: false,
};

export function AdminPromosClient({ accessToken }: { accessToken: string | null }) {
  const [items, setItems] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/v2/admin/promos", { method: "GET" }, accessToken, promoListResponseSchema);
      setItems(data.items);
    } catch (unknownError) {
      setItems([]);
      setError(getApiErrorMessage(unknownError, "Couldn't load promos."));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setModalOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (!accessToken) return;
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    // The window is date-only: start covers the whole start day, end the whole end day.
    const startIso = (v: string) => (v.trim() === "" ? undefined : new Date(`${v}T00:00:00`).toISOString());
    const endIso = (v: string) => (v.trim() === "" ? undefined : new Date(`${v}T23:59:59`).toISOString());
    const payload: CreatePromoRequest = {
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value || 0),
      max_discount: form.discount_type === "percent" ? num(form.max_discount) ?? null : null,
      min_total: num(form.min_total) ?? 0,
      usage_limit: num(form.usage_limit) ?? null,
      per_user_limit: num(form.per_user_limit) ?? null,
      starts_at: startIso(form.starts_at) ?? null,
      ends_at: endIso(form.ends_at) ?? null,
      applies_to: "stays",
      auto_apply: form.auto_apply,
      is_active: true,
    };
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiFetch(
        "/v2/admin/promos",
        { method: "POST", body: JSON.stringify(payload) },
        accessToken,
        promoCodeSchema,
      );
      setItems((prev) => [created, ...prev]);
      setModalOpen(false);
    } catch (unknownError) {
      setFormError(getApiErrorMessage(unknownError, "Couldn't create the promo."));
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, form]);

  const toggleActive = useCallback(
    async (promo: PromoCode) => {
      if (!accessToken) return;
      setBusyId(promo.promo_id);
      setError(null);
      try {
        const updated = await apiFetch(
          `/v2/admin/promos/${encodeURIComponent(promo.promo_id)}`,
          { method: "PATCH", body: JSON.stringify({ is_active: !promo.is_active }) },
          accessToken,
          promoCodeSchema,
        );
        setItems((prev) => prev.map((row) => (row.promo_id === updated.promo_id ? updated : row)));
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Couldn't update the promo."));
      } finally {
        setBusyId(null);
      }
    },
    [accessToken],
  );

  if (!accessToken) {
    return <div className="surface p-6 text-sm text-[var(--color-muted)]">Sign in to manage promos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          {loading ? "Loading promos…" : `${items.length} ${items.length === 1 ? "promo" : "promos"}`}
        </p>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" />
          Create promo
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`promo-skeleton-${i}`} className="surface p-4">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="surface p-10 text-center text-sm text-[var(--color-muted)]">
          No promo codes yet. Create one to run a discount.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((promo) => (
            <li
              key={promo.promo_id}
              className={`surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${promo.is_active ? "" : "opacity-70"}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-background)] px-2 py-1 font-mono text-sm font-bold tracking-wide text-[var(--color-text)]">
                    <Tag className="h-3.5 w-3.5 text-[var(--color-cta)]" />
                    {promo.code || "AUTO"}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-secondary)]">{discountSummary(promo)}</span>
                  {promo.auto_apply ? (
                    <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-secondary)]">Auto-apply</span>
                  ) : null}
                  {promo.is_active ? null : (
                    <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]">Inactive</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {windowLabel(promo)}
                  {promo.min_total > 0 ? ` · min ${formatPhpPeso(promo.min_total)}` : ""}
                  {` · used ${promo.used_count}${promo.usage_limit ? `/${promo.usage_limit}` : ""}`}
                  {promo.description ? ` · ${promo.description}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleActive(promo)}
                disabled={busyId === promo.promo_id}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
              >
                {busyId === promo.promo_id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {promo.is_active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create promo">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Create promo</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-background)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-2 rounded-xl bg-[var(--color-background)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.auto_apply}
                  onChange={(e) => setForm((f) => ({ ...f, auto_apply: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-secondary)]"
                />
                <span>
                  <span className="font-semibold text-[var(--color-text)]">Auto-apply (no code)</span>
                  <span className="block text-xs text-[var(--color-muted)]">A seasonal sale applied automatically to every eligible booking — guests don&apos;t type anything.</span>
                </span>
              </label>

              <Field label={form.auto_apply ? "Code (optional for auto promos)" : "Code"}>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder={form.auto_apply ? "No code needed" : "SUMMER25"}
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                />
              </Field>

              <Field label="Description (optional)">
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Summer sale"
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select
                    value={form.discount_type}
                    onChange={(v) => setForm((f) => ({ ...f, discount_type: v as PromoDiscountType }))}
                    options={[
                      { value: "percent", label: "Percentage" },
                      { value: "fixed", label: "Fixed ₱" },
                    ]}
                    ariaLabel="Discount type"
                  />
                </Field>
                <Field label={form.discount_type === "percent" ? "Percent off" : "Amount off (₱)"}>
                  <input
                    type="number"
                    min="0"
                    value={form.discount_value}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                    placeholder={form.discount_type === "percent" ? "20" : "500"}
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {form.discount_type === "percent" ? (
                  <Field label="Max discount ₱ (optional)">
                    <input
                      type="number"
                      min="0"
                      value={form.max_discount}
                      onChange={(e) => setForm((f) => ({ ...f, max_discount: e.target.value }))}
                      placeholder="No cap"
                      className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                    />
                  </Field>
                ) : (
                  <div />
                )}
                <Field label="Min spend ₱ (optional)">
                  <input
                    type="number"
                    min="0"
                    value={form.min_total}
                    onChange={(e) => setForm((f) => ({ ...f, min_total: e.target.value }))}
                    placeholder="0"
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Total uses (optional)">
                  <input
                    type="number"
                    min="0"
                    value={form.usage_limit}
                    onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
                    placeholder="Unlimited"
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                  />
                </Field>
                <Field label="Uses per guest (optional)">
                  <input
                    type="number"
                    min="0"
                    value={form.per_user_limit}
                    onChange={(e) => setForm((f) => ({ ...f, per_user_limit: e.target.value }))}
                    placeholder="Unlimited"
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Starts (optional)">
                  <DatePicker
                    value={form.starts_at}
                    onChange={(v) => setForm((f) => ({ ...f, starts_at: v }))}
                    placeholder="Any time"
                    ariaLabel="Promo start date"
                  />
                </Field>
                <Field label="Ends (optional)">
                  <DatePicker
                    value={form.ends_at}
                    onChange={(v) => setForm((f) => ({ ...f, ends_at: v }))}
                    placeholder="No end date"
                    ariaLabel="Promo end date"
                    minDate={form.starts_at || undefined}
                  />
                </Field>
              </div>

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
                disabled={submitting || !(form.code.trim() || form.auto_apply) || !(Number(form.discount_value) > 0)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {submitting ? "Creating…" : "Create promo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}
