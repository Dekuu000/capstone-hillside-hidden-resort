import { redirect } from "next/navigation";

export default function AdminScanLegacyRedirectPage() {
  redirect("/admin/check-in");
}

