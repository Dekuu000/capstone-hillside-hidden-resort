import type { ZodType } from "zod";

type FetchServerApiDataParams<T> = {
  accessToken: string;
  path: string;
  schema: ZodType<T>;
  revalidate?: number;
  timeoutMs?: number;
};

function normalizeApiBaseUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base || null;
}

export async function fetchServerApiData<T>({
  accessToken,
  path,
  schema,
  revalidate = 10,
  timeoutMs,
}: FetchServerApiDataParams<T>): Promise<T | null> {
  const base = normalizeApiBaseUrl();
  if (!base || !accessToken) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
  const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(`${base}${normalizedPath}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate },
      signal: controller?.signal,
    });
    if (!response.ok) return null;

    const json = await response.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
