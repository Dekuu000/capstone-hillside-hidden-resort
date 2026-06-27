import { redirect } from "next/navigation";

// "My Stay" was consolidated into "My Trips" (one guest home). Redirect any old
// links/bookmarks there.
export default function GuestMyStayRedirect() {
  redirect("/my-bookings");
}
