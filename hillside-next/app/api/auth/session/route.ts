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
  const secure = process.env.NODE_ENV === "production";
  const email = (body?.email || "").trim();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  if (email) {
    response.cookies.set(EMAIL_COOKIE, email, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
  } else {
    response.cookies.delete(EMAIL_COOKIE);
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(EMAIL_COOKIE);
  return response;
}