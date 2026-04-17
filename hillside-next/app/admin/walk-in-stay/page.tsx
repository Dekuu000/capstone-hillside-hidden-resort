import { redirect } from "next/navigation";

export default async function AdminWalkInStayPage() {
  redirect("/admin/walk-in?tab=stay");
}
