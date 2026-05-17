import { createClient } from "@supabase/supabase-js";
import { assertClientEnv, env } from "./env";

let browserClient: ReturnType<typeof createClient> | null = null;
type SafeSessionResult = {
  session: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getSession"]>>["data"]["session"] | null;
  error: unknown | null;
};
let inFlightSessionRequest: Promise<SafeSessionResult> | null = null;

function normalizeAuthError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const message = error.message.toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network request failed")) {
    return new Error("Cannot reach auth service. Ensure local Supabase is running, then retry.");
  }
  if (message.includes("navigator lockmanager lock") && message.includes("timed out")) {
    return new Error("Auth session is busy. Please retry in a moment.");
  }
  return error;
}

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  assertClientEnv();
  browserClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: process.env.NODE_ENV === "production",
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export async function safeGetSession() {
  if (inFlightSessionRequest) return inFlightSessionRequest;

  inFlightSessionRequest = (async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        return { session: null, error: normalizeAuthError(error) };
      }
      return { session: data.session ?? null, error: null };
    } catch (error) {
      return { session: null, error: normalizeAuthError(error) };
    } finally {
      inFlightSessionRequest = null;
    }
  })();

  return inFlightSessionRequest;
}
