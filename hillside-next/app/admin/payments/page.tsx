import { redirect } from "next/navigation";
import { AdminPaymentsClient } from "../../../components/admin-payments/AdminPaymentsClient";
import { getServerAccessToken, getServerAuthContext } from "../../../lib/serverAuth";
import { fetchServerApiData } from "../../../lib/serverApi";
import { adminPaymentsResponseSchema } from "../../../../packages/shared/src/schemas";
import { roleAtLeast, type AdminPaymentsResponse, type AdminPaymentsTab } from "../../../../packages/shared/src/types";

function normalizeTab(raw: string | undefined): AdminPaymentsTab {
  if (raw === "verified" || raw === "rejected" || raw === "all") return raw;
  return "all";
}

function normalizePage(raw: string | undefined): number {
  const parsed = Number(raw || "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

async function fetchInitialPayments(
  accessToken: string,
  tab: AdminPaymentsTab,
  search: string,
  page: number,
): Promise<AdminPaymentsResponse | null> {
  const offset = Math.max(0, (page - 1) * 10);
  const qs = new URLSearchParams({
    tab,
    limit: "10",
    offset: String(offset),
  });
  if (search) {
    qs.set("search", search);
  }
  return fetchServerApiData({
    accessToken,
    path: `/v2/payments?${qs.toString()}`,
    schema: adminPaymentsResponseSchema,
  });
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/payments");
  }

  // The verification inbox + payment history are a Management (Manager+) tool.
  // Front Desk (staff) only needs to record on-site payments, so we skip the
  // admin-gated list fetch for them and render a focused recording form — calling
  // the list endpoint as staff would 403 and surface a misleading "access" error.
  const auth = await getServerAuthContext(accessToken);
  const canManage = roleAtLeast(auth?.role, "admin");

  const resolvedSearchParams = (await searchParams) ?? {};
  const tab = normalizeTab(
    Array.isArray(resolvedSearchParams.tab) ? resolvedSearchParams.tab[0] : resolvedSearchParams.tab,
  );
  const search = (
    Array.isArray(resolvedSearchParams.search) ? resolvedSearchParams.search[0] : resolvedSearchParams.search
  )?.trim() || "";
  const page = normalizePage(
    Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page,
  );

  const initialData = canManage ? await fetchInitialPayments(accessToken, tab, search, page) : null;
  return (
    <AdminPaymentsClient
      initialToken={accessToken}
      initialData={initialData}
      initialTab={tab}
      initialSearch={search}
      initialPage={page}
      canManage={canManage}
    />
  );
}
