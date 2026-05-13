type DateDisplayOptions = {
  fallback?: string;
  locale?: string;
  formatOptions?: Intl.DateTimeFormatOptions;
};

type DateOnlyDisplayOptions = DateDisplayOptions & {
  treatIsoDateAsLocal?: boolean;
};

function normalizeDateInput(value: string, treatIsoDateAsLocal: boolean) {
  if (!treatIsoDateAsLocal) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
  return value;
}

export function formatDateTime(
  value?: string | null,
  options?: DateDisplayOptions,
) {
  const fallback = options?.fallback ?? "-";
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(options?.locale, options?.formatOptions);
}

export function formatDateOnly(
  value?: string | null,
  options?: DateOnlyDisplayOptions,
) {
  const fallback = options?.fallback ?? "-";
  if (!value) return fallback;
  const normalized = normalizeDateInput(value, options?.treatIsoDateAsLocal ?? true);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(options?.locale, options?.formatOptions);
}

export function formatDateWithYear(value?: string | null, fallback = "-") {
  return formatDateOnly(value, {
    fallback,
    formatOptions: {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  });
}

export function formatDateWithWeekday(value?: string | null, fallback = "-") {
  return formatDateOnly(value, {
    fallback,
    formatOptions: {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  });
}

export function formatLocalDateTime(value?: string | null, fallback = "-") {
  return formatDateTime(value, { fallback });
}

export function formatCachedAt(value?: string | null) {
  return formatLocalDateTime(value);
}
