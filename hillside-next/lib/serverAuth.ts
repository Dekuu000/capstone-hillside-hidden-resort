import { cookies } from "next/headers";

type AuthContext = {
  user_id: string;
  email: string | null;
  role: string;
};

const ACCESS_TOKEN_COOKIE = "hs_at";
const EMAIL_COOKIE = "hs_em";

function normalizeApiBaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (!base) {
    return "";
  }
  return base.replace(/\/+$/, "");
}

export async function getServerAccessToken() {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value || null;
}

export async function getServerAuthContext(accessToken: string): Promise<AuthContext | null> {
  if (!accessToken) return null;
  const apiBase = normalizeApiBaseUrl();
  if (!apiBase) return null;

  try {
    const response = await fetch(`${apiBase}/v2/auth/context`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthContext;
  } catch {
    // Do not crash SSR pages when API is temporarily unavailable.
    return null;
  }
}

export async function getServerEmailHint() {
  const jar = await cookies();
  return jar.get(EMAIL_COOKIE)?.value || null;
}
