type ClientEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiBaseUrl: string;
  chainKey: string;
  chainId: string;
  supportedChainKeys: string[];
};

function normalize(value: string | undefined) {
  return (value || "").trim();
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const env: ClientEnv = {
  supabaseUrl: normalize(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: normalize(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  apiBaseUrl: normalize(process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, ""),
  chainKey: normalize(process.env.NEXT_PUBLIC_CHAIN_KEY || "sepolia").toLowerCase(),
  chainId: normalize(process.env.NEXT_PUBLIC_CHAIN_ID || ""),
  supportedChainKeys: normalize(
    process.env.NEXT_PUBLIC_SUPPORTED_CHAIN_KEYS || "sepolia,amoy"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
};

export function assertClientEnv() {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (!env.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.supabasePublishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!env.apiBaseUrl) missing.push("NEXT_PUBLIC_API_BASE_URL");

  if (env.supabaseUrl && !isValidHttpUrl(env.supabaseUrl)) {
    invalid.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (env.apiBaseUrl && !isValidHttpUrl(env.apiBaseUrl)) {
    invalid.push("NEXT_PUBLIC_API_BASE_URL");
  }

  const supportedSet = new Set(env.supportedChainKeys);
  if (!supportedSet.has(env.chainKey)) {
    invalid.push("NEXT_PUBLIC_CHAIN_KEY");
  }

  if (env.chainId && !/^\d+$/.test(env.chainId)) {
    invalid.push("NEXT_PUBLIC_CHAIN_ID");
  }

  if (missing.length || invalid.length) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(", ")}`);
    throw new Error(`Next.js public env validation failed (${parts.join("; ")})`);
  }

  // Fallback chain IDs make local network switching config-driven.
  if (!env.chainId) {
    env.chainId = env.chainKey === "sepolia" ? "11155111" : "80002";
  }
}
