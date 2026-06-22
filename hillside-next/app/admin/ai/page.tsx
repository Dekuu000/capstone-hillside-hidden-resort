import { AdminAiCenterClient } from "../../../components/admin-ai/AdminAiCenterClient";
import { getServerAccessToken, requireRoleAtLeastServer } from "../../../lib/serverAuth";

export default async function AdminAiPage() {
  await requireRoleAtLeastServer("super_admin");
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    return (
      <section className="mx-auto w-full max-w-[1600px]">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">AI Hospitality Intelligence</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return <AdminAiCenterClient token={accessToken} />;
}

