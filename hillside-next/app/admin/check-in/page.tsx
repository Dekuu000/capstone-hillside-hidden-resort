import { AdminCheckinClient } from "../../../components/admin-checkin/AdminCheckinClient";
import { getServerAccessToken } from "../../../lib/serverAuth";

export default async function AdminCheckInPage() {
  const accessToken = await getServerAccessToken();
  return <AdminCheckinClient initialToken={accessToken} />;
}
