import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { roleAtLeast, type Role } from "../../packages/shared/src/types";

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
      // NEVER cache: this resolves the current user's identity + role from their
      // bearer token. Next's Data Cache is a SHARED server cache (not per-user),
      // so caching here leaks one user's role/identity to another.
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

/**
 * Server-side role gate for back-office pages. Redirects to login if signed out,
 * or to `redirectTo` (default the admin home) if the user's role is below `min`.
 * Used to keep technical pages (Records & Security, Smart Pricing, etc.) System-Admin-only.
 */
export async function requireRoleAtLeastServer(min: Role, redirectTo = "/admin"): Promise<AuthContext> {
  const token = await getServerAccessToken();
  const auth = token ? await getServerAuthContext(token) : null;
  if (!auth) {
    redirect("/login?next=/admin");
  }
  if (!roleAtLeast(auth.role, min)) {
    redirect(redirectTo);
  }
  return auth;
}
