"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import type { AdminReviewItem } from "../../../packages/shared/src/types";
import { adminReviewItemSchema, adminReviewsResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? "fill-[var(--color-cta)] text-[var(--color-cta)]" : "fill-transparent text-[var(--color-border)]"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function AdminReviewsClient({ accessToken }: { accessToken: string | null }) {
  const [items, setItems] = useState<AdminReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(
        "/v2/reviews/admin",
        { method: "GET" },
        accessToken,
        adminReviewsResponseSchema,
      );
      setItems(data.items);
    } catch (unknownError) {
      setItems([]);
      setError(getApiErrorMessage(unknownError, "Couldn't load reviews."));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleHidden = useCallback(
    async (review: AdminReviewItem) => {
      if (!accessToken) return;
      setBusyId(review.review_id);
      setError(null);
      try {
        const updated = await apiFetch(
          `/v2/reviews/admin/${encodeURIComponent(review.review_id)}`,
          { method: "PATCH", body: JSON.stringify({ is_hidden: !review.is_hidden }) },
          accessToken,
          adminReviewItemSchema,
        );
        setItems((prev) => prev.map((row) => (row.review_id === updated.review_id ? updated : row)));
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Couldn't update the review."));
      } finally {
        setBusyId(null);
      }
    },
    [accessToken],
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`review-skeleton-${i}`} className="surface p-4">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton mt-2 h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="surface p-6 text-sm text-[var(--color-muted)]">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-2 font-semibold text-[var(--color-secondary)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="surface p-10 text-center text-sm text-[var(--color-muted)]">
        No reviews yet. Reviews from verified, checked-out stays will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
      ) : null}
      {items.map((review) => (
        <div
          key={review.review_id}
          className={`surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${review.is_hidden ? "opacity-70" : ""}`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Stars rating={review.rating} />
              <span className="text-sm font-semibold text-[var(--color-text)]">{review.unit_name || "Stay"}</span>
              {review.is_hidden ? (
                <span className="inline-flex items-center rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]">
                  Hidden
                </span>
              ) : null}
            </div>
            {review.comment ? (
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text)]">{review.comment}</p>
            ) : (
              <p className="mt-1.5 text-sm italic text-[var(--color-muted)]">No comment left.</p>
            )}
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              {review.guest_name || "Verified guest"} · {formatDate(review.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleHidden(review)}
            disabled={busyId === review.review_id}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
          >
            {review.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {busyId === review.review_id ? "Saving…" : review.is_hidden ? "Show" : "Hide"}
          </button>
        </div>
      ))}
    </div>
  );
}
