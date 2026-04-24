type ApiErrorMessageOverrides = {
  unauthorized?: string;
  forbidden?: string;
  notFound?: string;
  conflict?: string;
  unprocessable?: string;
  serviceUnavailable?: string;
  network?: string;
  offline?: string;
};

const HTTP_ERROR_PATTERN = /^HTTP\s+(\d{3}):\s*([\s\S]*)$/i;

function asString(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  return String(error ?? "").trim();
}

function parseHttpError(message: string): { status: number; detail: string | null } | null {
  const match = message.match(HTTP_ERROR_PATTERN);
  if (!match) return null;
  const status = Number(match[1]);
  const rawDetail = match[2]?.trim() || "";
  if (!Number.isFinite(status)) return null;

  if (!rawDetail) return { status, detail: null };

  try {
    const parsed = JSON.parse(rawDetail) as { detail?: unknown };
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
      return { status, detail: parsed.detail.trim() };
    }
  } catch {
    // non-JSON error payload; keep raw detail
  }

  return { status, detail: rawDetail };
}

function mapStatusMessage(
  status: number,
  overrides?: ApiErrorMessageOverrides,
): string | null {
  switch (status) {
    case 401:
      return overrides?.unauthorized ?? "Sign in required.";
    case 403:
      return overrides?.forbidden ?? "You are not allowed to perform this action.";
    case 404:
      return overrides?.notFound ?? "Requested resource was not found.";
    case 409:
      return overrides?.conflict ?? "Action could not be completed due to a conflict.";
    case 422:
      return overrides?.unprocessable ?? "Request validation failed.";
    case 503:
      return overrides?.serviceUnavailable ?? "Service is temporarily unavailable. Please try again.";
    default:
      return null;
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
  overrides?: ApiErrorMessageOverrides,
): string {
  const message = asString(error);
  if (!message) return fallback;

  if (message.startsWith("Offline:")) {
    return overrides?.offline ?? message;
  }

  if (message.toLowerCase().includes("network request failed")) {
    return overrides?.network ?? "Network error. Please check your internet connection and retry.";
  }

  const parsedHttp = parseHttpError(message);
  if (!parsedHttp) return message;

  if (parsedHttp.detail) return parsedHttp.detail;
  return mapStatusMessage(parsedHttp.status, overrides) ?? fallback;
}
