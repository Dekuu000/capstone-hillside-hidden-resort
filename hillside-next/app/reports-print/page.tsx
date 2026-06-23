import { redirect } from "next/navigation";
import type { Role } from "../../../packages/shared/src/types";
import { ROLE_LABELS, isBackOffice } from "../../../packages/shared/src/types";
import { reportsOverviewResponseSchema } from "../../../packages/shared/src/schemas";
import { AutoPrint } from "../../components/admin-reports/AutoPrint";
import { ReportDocument } from "../../components/admin-reports/ReportDocument";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { fetchServerApiData } from "../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext } from "../../lib/serverAuth";

/**
 * Standalone, chrome-free page that renders ONLY the report document, so
 * "Print / Save as PDF" captures the report and nothing else. Opened in a new
 * tab by the Reports page's print button; auto-triggers the print dialog.
 */
export default async function ReportsPrintPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    redirect("/login?next=/admin/reports");
  }

  const auth = await getServerAuthContext(accessToken);
  if (!auth || !isBackOffice(auth.role)) {
    redirect("/login?next=/admin/reports");
  }

  const resolved = (await searchParams) ?? {};
  const fromDate = (Array.isArray(resolved.from) ? resolved.from[0] : resolved.from) || todayPlusLocalIsoDate(-7);
  const toDate = (Array.isArray(resolved.to) ? resolved.to[0] : resolved.to) || todayPlusLocalIsoDate(0);

  const overview = await fetchServerApiData({
    accessToken,
    path: `/v2/reports/overview?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
    schema: reportsOverviewResponseSchema,
  });

  const preparedBy = `${ROLE_LABELS[(auth.role || "") as Role] || "Back office"}${auth.email ? ` (${auth.email})` : ""}`;
  const generatedAt = new Date().toISOString();

  if (!overview) {
    return (
      <main className="mx-auto max-w-[760px] p-8 text-sm text-[var(--color-text)]">
        Unable to load report data for this range. Close this tab and try again.
      </main>
    );
  }

  return (
    <main className="bg-white">
      <ReportDocument overview={overview} preparedBy={preparedBy} generatedAt={generatedAt} />
      <AutoPrint />
    </main>
  );
}
