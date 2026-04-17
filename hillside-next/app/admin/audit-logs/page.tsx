import { redirect } from "next/navigation";

export default async function AdminAuditLogsRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  qs.set("tab", "audit");
  for (const [key, value] of Object.entries(resolved)) {
    if (!value || key === "tab") continue;
    if (Array.isArray(value)) {
      if (value[0]) qs.set(key, value[0]);
      continue;
    }
    qs.set(key, value);
  }
  redirect(`/admin/blockchain?${qs.toString()}`);
}
