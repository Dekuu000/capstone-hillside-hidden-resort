import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
}

function buildPageList(totalPages: number, currentPage: number): Array<number | 'ellipsis'> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function Pagination({
    currentPage,
    pageSize,
    totalItems,
    onPageChange,
}: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(totalItems, currentPage * pageSize);
    const pages = buildPageList(totalPages, currentPage);

    return (
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <p className="text-xs font-medium text-gray-500 md:text-sm">
                Showing <span className="text-gray-900">{start}</span> to <span className="text-gray-900">{end}</span> of{' '}
                <span className="text-gray-900">{totalItems}</span> results
            </p>

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>

                {pages.map((item, index) => (
                    item === 'ellipsis' ? (
                        <span
                            key={`ellipsis-${index}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </span>
                    ) : (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onPageChange(item)}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                                item === currentPage
                                    ? 'border-primary bg-primary text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
                            }`}
                        >
                            {item}
                        </button>
                    )
                ))}

                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
