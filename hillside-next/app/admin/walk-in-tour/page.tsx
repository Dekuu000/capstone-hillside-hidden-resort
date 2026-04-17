import { redirect } from "next/navigation";

export default async function AdminWalkInTourPage() {
  redirect("/admin/walk-in?tab=tour");
}

