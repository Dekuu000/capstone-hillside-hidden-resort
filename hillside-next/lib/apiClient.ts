import { env } from "./env";

export type Parser<T> = {
  parse: (value: unknown) => T;
};

type RequestStat = {
  count: number;
  totalMs: number;
  lastMs: number;
  lastStatus: number;
};

const requestStats = new Map<string, RequestStat>();
const pageStats = new Map<string, { count: number; totalMs: number }>();
let lastPage = "";

function normalizeBaseUrl() {
  const base = env.apiBaseUrl?.trim() ?? "";
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL.");
  }
  return base.replace(/\/+$/, "");
}

function getPageKey() {
  if (typeof window === "undefined") return "server";
  return window.location.pathname || "unknown";
}

function recordTiming(path: string, durationMs: number, status: number) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  const key = path.startsWith("/") ? path : `/${path}`;
  const stat = requestStats.get(key) ?? { count: 0, totalMs: 0, lastMs: 0, lastStatus: status };
  stat.count += 1;
  stat.totalMs += durationMs;
  stat.lastMs = durationMs;
  stat.lastStatus = status;
  requestStats.set(key, stat);

  const page = getPageKey();
  const pageStat = pageStats.get(page) ?? { count: 0, totalMs: 0 };
  pageStat.count += 1;
  pageStat.totalMs += durationMs;
  pageStats.set(page, pageStat);

  if (page !== lastPage) {
    if (lastPage) {
      const prior = pageStats.get(lastPage);
      if (prior) {
        console.debug(
          `[perf] page=${lastPage} requests=${prior.count} total_ms=${prior.totalMs.toFixed(2)}`,
        );
      }
    }
    lastPage = page;
  }

  console.debug(`[perf] ${key} status=${status} duration_ms=${durationMs.toFixed(2)}`);
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
  const start = performance.now();
  const response = await fetch(`${normalizeBaseUrl()}${normalizedPath}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const durationMs = performance.now() - start;
  recordTiming(normalizedPath, durationMs, response.status);

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
