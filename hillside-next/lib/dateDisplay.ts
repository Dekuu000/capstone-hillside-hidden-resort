export function formatLocalDateTime(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  return new Date(value).toLocaleString();
}

export function formatCachedAt(value?: string | null) {
  return formatLocalDateTime(value);
}
