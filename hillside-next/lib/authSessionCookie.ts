export async function setServerSessionCookie(accessToken: string, emailValue?: string | null) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ accessToken, email: emailValue ?? null }),
  });
  if (!response.ok) {
    throw new Error("Unable to initialize server session cookie.");
  }
}

export async function clearServerSessionCookie() {
  await fetch("/api/auth/session", { method: "DELETE" });
}
