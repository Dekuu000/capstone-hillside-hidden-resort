import { env } from "./env";

export type Parser<T> = {
  parse: (value: unknown) => T;
};

function normalizeBaseUrl() {
  const base = env.apiBaseUrl?.trim() ?? "";
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL.");
  }
  return base.replace(/\/+$/, "");
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit,
  accessToken: string,
  parser?: Parser<T>,
): Promise<T> {
  if (!accessToken) {
    throw new Error("Missing access token.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${normalizeBaseUrl()}${normalizedPath}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const json = (await response.json()) as unknown;
  if (!parser) return json as T;
  return parser.parse(json);
}
