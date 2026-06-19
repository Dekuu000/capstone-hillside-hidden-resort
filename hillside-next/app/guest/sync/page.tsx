import { redirect } from "next/navigation";

// The guest-facing Sync Center has been removed — offline sync still runs
// automatically in the background. Any stray link lands on the stay hub.
export default function GuestSyncPage() {
  redirect("/guest/my-stay");
}
