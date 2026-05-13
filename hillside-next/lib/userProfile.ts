type UserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export function resolveUserDisplayName(user: UserLike | null | undefined, fallback = "Guest") {
  const metadataName = user?.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }
  if (typeof user?.email === "string" && user.email.trim()) {
    return user.email.trim();
  }
  return fallback;
}

export function resolveUserProfileName(user: UserLike | null | undefined, fallback = "Guest User") {
  const metadataName = user?.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }
  if (typeof user?.email === "string" && user.email.includes("@")) {
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart) return localPart;
  }
  return fallback;
}
