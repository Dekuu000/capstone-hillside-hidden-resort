"use client";

import { Pagination } from "./Pagination";

/**
 * Server-page pagination that updates the URL. The shared <Pagination> "Link
 * mode" needs a hrefForPage FUNCTION, which a Server Component cannot pass to a
 * Client Component. This thin client wrapper builds that closure on the client
 * from serializable props, so server pages can paginate via the URL safely.
 */
export function LinkPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  pageParam = "page",
  extraParams,
  className,
}: {
  page: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  /** Query-string key for the page number (default "page"). */
  pageParam?: string;
  /** Other query params to preserve on each page link. */
  extraParams?: Record<string, string>;
  className?: string;
}) {
  const hrefForPage = (n: number) => {
    const qs = new URLSearchParams(extraParams);
    qs.set(pageParam, String(n));
    return `?${qs.toString()}`;
  };

  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      hrefForPage={hrefForPage}
      className={className}
    />
  );
}
