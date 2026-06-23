import { redirect } from "next/navigation";

// Tours management now lives on the unified "Stays & Tours" page as a tab.
export default function AdminToursRedirectPage() {
  redirect("/admin/units?tab=tours");
}
