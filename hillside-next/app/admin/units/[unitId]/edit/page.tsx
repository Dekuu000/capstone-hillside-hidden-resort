import { redirect } from "next/navigation";

export default async function AdminUnitsEditLegacyRedirectPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  redirect(`/admin/units?unit_id=${encodeURIComponent(unitId)}`);
}

