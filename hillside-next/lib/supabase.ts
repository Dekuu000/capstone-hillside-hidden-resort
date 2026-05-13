import { createClient } from "@supabase/supabase-js";
import { assertClientEnv, env } from "./env";

let browserClient: ReturnType<typeof createClient> | null = null;

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
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { session: null, error };
    }
    return { session: data.session ?? null, error: null };
  } catch (error) {
    return { session: null, error };
  }
}
