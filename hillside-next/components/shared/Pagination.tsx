"use client";

import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One shared, responsive pager for every list/table across guest, staff, admin
 * and super-admin. Two modes:
 *  - Controlled: pass `onPageChange` (client state, e.g. fetch-on-change panels).
 *  - Link:       pass `hrefForPage` (server-rendered pages that paginate via URL).
 *
 * Mobile: Prev / Next stretch full-width for easy thumbs; numeric pages hide.
 * Desktop: a windowed numeric strip (1 … 4 5 6 … 20) appears between Prev/Next.
 */
type BaseProps = {
  /** 1-based current page. */
  page: number;
  /** Total page count. Drives the numeric strip + Next when `hasNext` is omitted. */
  totalPages?: number;
  /** Explicit overrides for offset/`has_more` style sources where totalPages is fuzzy. */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Optional count summary; when both are set the default summary reads "Showing X–Y of N". */
  totalCount?: number;
  pageSize?: number;
  /** Replace the default left-side summary entirely. */
  summary?: ReactNode;
  /** Disable all controls (e.g. while loading). */
  disabled?: boolean;
  /** Hide the whole pager when there is only one page and nothing more to load. */
  hideWhenSinglePage?: boolean;
  /** Show the numeric page strip on desktop (default true when totalPages is known). */
  showNumbers?: boolean;
  className?: string;
};

type ControlledProps = BaseProps & { onPageChange: (page: number) => void; hrefForPage?: never };
type LinkProps = BaseProps & { hrefForPage: (page: number) => string; onPageChange?: never };
type PaginationProps = ControlledProps | LinkProps;

const PILL_BASE =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] sm:h-9 sm:min-w-9";
const PILL_ENABLED =
  "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-background)]";
const PILL_DISABLED =
  "cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted)] opacity-60";
const PILL_ACTIVE = "border-[var(--color-primary)] bg-[var(--color-primary)] text-white";

function buildWindow(current: number, total: number): Array<number | string> {
  const keep = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | string> = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push(`gap-${n}`);
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination(props: PaginationProps) {
  const {
    page,
    totalPages,
    hasPrev,
    hasNext,
    totalCount,
    pageSize,
    summary,
    disabled = false,
    hideWhenSinglePage = false,
    showNumbers = true,
    className = "",
  } = props;

  // Hooks must run unconditionally (before any early return).
  const router = useRouter();
  const jumpId = useId();
  const [jumpValue, setJumpValue] = useState("");

  const canPrev = (hasPrev ?? page > 1) && !disabled;
  const canNext = (hasNext ?? (totalPages ? page < totalPages : false)) && !disabled;

  if (hideWhenSinglePage && (!totalPages || totalPages <= 1) && !canNext && !canPrev) {
    return null;
  }

  const defaultSummary = (() => {
    if (summary !== undefined) return summary;
    if (totalCount != null && pageSize != null) {
      const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
      const end = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
      return (
        <>
          Showing <span className="font-semibold text-[var(--color-text)]">{start}</span>–
          <span className="font-semibold text-[var(--color-text)]">{end}</span> of{" "}
          <span className="font-semibold text-[var(--color-text)]">{totalCount}</span>
        </>
      );
    }
    if (totalPages) {
      return (
        <>
          Page <span className="font-semibold text-[var(--color-text)]">{page}</span> of{" "}
          <span className="font-semibold text-[var(--color-text)]">{totalPages}</span>
        </>
      );
    }
    return null;
  })();

  const isLink = "hrefForPage" in props && typeof props.hrefForPage === "function";
  const goTo = (target: number) => {
    if ("onPageChange" in props && props.onPageChange) props.onPageChange(target);
  };

  // "Jump to page" — only worth showing once the numeric strip can't list every
  // page. Lets a user reach e.g. page 20 in one step instead of clicking Next.
  const showJump = !disabled && !!totalPages && totalPages > 7;
  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(jumpValue);
    if (!totalPages || !Number.isFinite(parsed)) return;
    const target = Math.min(Math.max(1, Math.round(parsed)), totalPages);
    setJumpValue("");
    if (target === page) return;
    if (isLink) router.push((props as LinkProps).hrefForPage(target));
    else goTo(target);
  };

  const renderControl = (target: number, enabled: boolean, label: string, content: ReactNode, extra = "") => {
    const cls = `${PILL_BASE} ${enabled ? PILL_ENABLED : PILL_DISABLED} ${extra}`;
    if (isLink && enabled) {
      return (
        <Link href={(props as LinkProps).hrefForPage(target)} prefetch={false} aria-label={label} className={cls}>
          {content}
        </Link>
      );
    }
    return (
      <button type="button" disabled={!enabled} aria-label={label} onClick={() => enabled && goTo(target)} className={cls}>
        {content}
      </button>
    );
  };

  const renderNumber = (n: number) => {
    const active = n === page;
    const cls = `${PILL_BASE} ${active ? PILL_ACTIVE : PILL_ENABLED} px-0`;
    if (active || disabled) {
      return (
        <span key={n} aria-current={active ? "page" : undefined} className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_DISABLED} px-0`}>
          {n}
        </span>
      );
    }
    if (isLink) {
      return (
        <Link key={n} href={(props as LinkProps).hrefForPage(n)} prefetch={false} aria-label={`Page ${n}`} className={cls}>
          {n}
        </Link>
      );
    }
    return (
      <button key={n} type="button" aria-label={`Page ${n}`} onClick={() => goTo(n)} className={cls}>
        {n}
      </button>
    );
  };

  const numbers = showNumbers && totalPages && totalPages > 1 ? buildWindow(page, totalPages) : [];

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {defaultSummary != null ? (
        <p className="text-xs text-[var(--color-muted)] sm:text-sm">{defaultSummary}</p>
      ) : (
        <span className="hidden sm:block" />
      )}

      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
        {showJump ? (
          <form onSubmit={submitJump} className="flex items-center justify-center gap-1.5 sm:justify-start">
            <label htmlFor={jumpId} className="text-xs text-[var(--color-muted)] sm:text-sm">
              Go to
            </label>
            <input
              id={jumpId}
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              value={jumpValue}
              onChange={(event) => setJumpValue(event.target.value)}
              placeholder={String(page)}
              aria-label={`Go to page, 1 to ${totalPages}`}
              className="h-10 w-16 rounded-full border border-[var(--color-border)] bg-white px-2 text-center text-sm text-[var(--color-text)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] sm:h-9"
            />
            <button type="submit" className={`${PILL_BASE} ${PILL_ENABLED}`}>
              Go
            </button>
          </form>
        ) : null}

        <div className="flex w-full items-center gap-1.5 sm:w-auto">
        {renderControl(
          page - 1,
          canPrev,
          "Previous page",
          <>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Prev</span>
          </>,
          "flex-1 sm:flex-none",
        )}

        {numbers.length > 0 ? (
          <div className="hidden items-center gap-1.5 sm:flex">
            {numbers.map((entry) =>
              typeof entry === "number" ? (
                renderNumber(entry)
              ) : (
                <span key={entry} className="px-1 text-sm text-[var(--color-muted)]">
                  …
                </span>
              ),
            )}
          </div>
        ) : null}

        {renderControl(
          page + 1,
          canNext,
          "Next page",
          <>
            <span>Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </>,
          "flex-1 sm:flex-none",
        )}
        </div>
      </div>
    </nav>
  );
}
