import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "hs_at";
const EMAIL_COOKIE = "hs_em";

function getTokenMaxAge(accessToken: string) {
  try {
    const payloadPart = accessToken.split(".")[1] ?? "";
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { exp?: number };
    if (!payload.exp) return 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(60, payload.exp - now);
  } catch {
    return 60 * 60;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { accessToken?: string; email?: string | null }
    | null;

  const accessToken = body?.accessToken?.trim();
  if (!accessToken) {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  const maxAge = getTokenMaxAge(accessToken);
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";

  jar.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  const email = (body?.email || "").trim();
  if (email) {
    jar.set(EMAIL_COOKIE, email, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
  } else {
    jar.delete(EMAIL_COOKIE);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACCESS_TOKEN_COOKIE);
  jar.delete(EMAIL_COOKIE);
  return NextResponse.json({ ok: true });
}

