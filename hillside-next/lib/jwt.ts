function decodeBase64(value: string) {
  if (typeof atob === "function") {
    return atob(value);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
}

export function parseJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(decodeBase64(padded)) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
