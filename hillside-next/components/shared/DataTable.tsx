"use client";

import { cn } from "../../lib/cn";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";

type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (item: T) => React.ReactNode;
};

type DataTableProps<T> = {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  page?: number;
  hasMore?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  loading?: boolean;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  emptyTitle = "No records found",
  emptyDescription = "Adjust filters or refresh to load data.",
  pageSize = 25,
  page = 1,
  hasMore = false,
  onNextPage,
  onPrevPage,
  loading = false,
  className,
}: DataTableProps<T>) {
  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn("surface overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn("border-b border-[var(--color-border)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(8, pageSize) }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="border-b border-[var(--color-border)]">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        <div className="skeleton h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
                  <tr
                    key={rowKey(row, index)}
                    tabIndex={onRowClick ? 0 : -1}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "border-b border-[var(--color-border)] odd:bg-white even:bg-slate-50/40",
                      onRowClick && "cursor-pointer transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none",
                    )}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 align-top text-[var(--color-text)]">
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {(onPrevPage || onNextPage) && !loading ? (
        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-slate-50 px-4 py-3">
          <p className="text-xs text-[var(--color-muted)]">Page {page}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onPrevPage} disabled={!onPrevPage || page <= 1}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" onClick={onNextPage} disabled={!onNextPage || !hasMore}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
