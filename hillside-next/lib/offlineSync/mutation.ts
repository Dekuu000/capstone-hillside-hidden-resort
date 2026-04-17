import type { Parser } from "../apiClient";
import { apiFetch } from "../apiClient";
import { env } from "../env";
import { enqueueOfflineOperation } from "./engine";

type SyncEntityType =
  | "reservation"
  | "tour_reservation"
  | "payment_submission"
  | "checkin"
  | "checkout"
  | "service_request";

type SyncMutationOptions<TPayload extends Record<string, unknown>, TResult> = {
  path: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  payload: TPayload;
  parser: Parser<TResult>;
  accessToken: string;
  entityType: SyncEntityType;
  action: string;
  entityId?: string | null;
  buildOptimisticResponse?: (payload: TPayload) => TResult;
};

type SyncMutationResult<TResult> =
  | { mode: "online"; data: TResult }
  | { mode: "queued"; data: TResult | null; operationId: string };

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function shouldQueueByError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return text.includes("failed to fetch") || text.includes("networkerror");
}

function ensureIdempotencyKey<TPayload extends Record<string, unknown>>(payload: TPayload): TPayload {
  const existing = typeof payload.idempotency_key === "string" ? payload.idempotency_key.trim() : "";
  if (existing) return payload;
  return {
    ...payload,
    idempotency_key: crypto.randomUUID(),
  } as TPayload;
}

export async function syncAwareMutation<TPayload extends Record<string, unknown>, TResult>(
  options: SyncMutationOptions<TPayload, TResult>,
): Promise<SyncMutationResult<TResult>> {
  const normalizedPayload = ensureIdempotencyKey(options.payload);
  const method = options.method || "POST";

  if (!env.syncEnabled) {
    const data = await apiFetch<TResult>(
      normalizePath(options.path),
      { method, body: JSON.stringify(normalizedPayload) },
      options.accessToken,
      options.parser,
    );
    return { mode: "online", data };
  }

  const shouldTryOnline = typeof navigator === "undefined" || navigator.onLine;
  if (shouldTryOnline) {
    try {
      const data = await apiFetch<TResult>(
        normalizePath(options.path),
        { method, body: JSON.stringify(normalizedPayload) },
        options.accessToken,
        options.parser,
      );
      return { mode: "online", data };
    } catch (error) {
      if (!shouldQueueByError(error)) throw error;
    }
  }

  const queued = await enqueueOfflineOperation({
    idempotency_key: String(normalizedPayload.idempotency_key),
    entity_type: options.entityType,
    action: options.action,
    entity_id: options.entityId ?? null,
    payload: normalizedPayload,
  });
  const optimistic = options.buildOptimisticResponse ? options.buildOptimisticResponse(normalizedPayload) : null;
  return {
    mode: "queued",
    data: optimistic,
    operationId: queued.operation_id,
  };
}
