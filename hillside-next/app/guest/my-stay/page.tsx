import Link from "next/link";
import { Bell, CalendarCheck, MapPin, ShieldCheck, TreePalm } from "lucide-react";
import { redirect } from "next/navigation";
import { stayDashboardResponseSchema } from "../../../../packages/shared/src/schemas";
import type { ReservationListItem, StayDashboardResponse } from "../../../../packages/shared/src/types";
import { MyStayDashboardClient } from "../../../components/guest-stay/MyStayDashboardClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { GuestPageIntro } from "../../../components/guest/GuestPageIntro";
import { GuestEmptyState } from "../../../components/guest/GuestEmptyState";
import { StaySnapshotCard } from "../../../components/guest/StaySnapshotCard";
import { formatDateWithWeekday } from "../../../lib/dateDisplay";
import { formatPhpPeso as toPeso } from "../../../lib/formatCurrency";
import { fetchServerApiData } from "../../../lib/serverApi";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../../lib/serverAuth";
import { isBackOffice } from "../../../../packages/shared/src/types";

const QUICK_ACTIONS = [
  { href: "/stays", label: "Book a stay", desc: "Rooms, cottages & event spaces", icon: CalendarCheck },
  { href: "/tours", label: "Tours", desc: "Day passes & experiences", icon: TreePalm },
  { href: "/guest/map", label: "Resort map", desc: "Offline wayfinding", icon: MapPin },
  { href: "/guest/services", label: "Services", desc: "Room service & spa", icon: Bell },
];

function QuickActions() {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Explore the resort</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK_ACTIONS.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition hover:shadow-[var(--shadow-md)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-[var(--color-text)] group-hover:underline">{label}</p>
            <p className="text-xs muted-text">{desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function roomFallbackDisplay(stay: ReservationListItem) {
  const units = stay.units ?? [];
  if (!units.length) return "To be assigned";
  const names = units.map((entry) => {
    const unit = entry.unit;
    if (unit?.room_number && unit?.unit_code) return `Room ${unit.room_number} (${unit.unit_code})`;
    if (unit?.unit_code) return unit.unit_code;
    return unit?.name || "Assigned unit";
  });
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}

function getQrStatusLabel(status: string) {
  if (["pending_payment", "for_verification", "confirmed", "checked_in"].includes(status)) {
    return "QR ready";
  }
  return "No QR yet";
}

async function fetchStayDashboard(accessToken: string): Promise<StayDashboardResponse | null> {
  return fetchServerApiData({
    accessToken,
    path: "/v2/me/stay-dashboard",
    schema: stayDashboardResponseSchema,
  });
}

export default async function GuestMyStayPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/my-stay");
  // Resolve auth, dashboard data, and email hint concurrently instead of
  // back-to-back round trips, so the page returns in ~one round trip.
  const [auth, stayDashboard, emailHint] = await Promise.all([
    getServerAuthContext(accessToken),
    fetchStayDashboard(accessToken),
    getServerEmailHint(),
  ]);
  if (isBackOffice(auth?.role)) {
    redirect("/admin");
  }

  const stay = stayDashboard?.reservation ?? null;
  const welcomeNotification = stayDashboard?.welcome_notification ?? null;

  return (
    <GuestShell initialEmail={emailHint}>
      <GuestPageIntro
        testId="guest-hero"
        title="My stay"
        subtitle="Your trip at a glance — dates, balance, and check-in pass."
        aside={
          stay ? (
            <StaySnapshotCard
              nextStayDate={formatDateWithWeekday(stay.check_in_date || null)}
              outstandingBalance={toPeso(Number(stay.balance_due ?? 0))}
              qrStatus={getQrStatusLabel(stay.status)}
            />
          ) : undefined
        }
      />
      <QuickActions />
      {!stay ? (
        <GuestEmptyState
          testId="guest-empty-state"
          title="No active stay yet"
          message="Your check-in dashboard appears once a reservation becomes active. Book a stay or a tour above to get started."
        />
      ) : (
        <div className="space-y-3">
          <MyStayDashboardClient
            accessToken={accessToken}
            reservationId={stay.reservation_id}
            reservationCode={stay.reservation_code}
            checkInDate={stay.check_in_date}
            checkOutDate={stay.check_out_date}
            roomDisplay={roomFallbackDisplay(stay)}
            status={stay.status}
            welcomeNotification={welcomeNotification}
          />

          <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
              <ShieldCheck className="h-4 w-4 text-[var(--color-secondary)]" />
              Payment Summary
            </h2>
            <div className="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
              <p>
                Paid:{" "}
                <span className="font-semibold text-[var(--color-text)]">
                  {toPeso(Number(stay.amount_paid_verified || 0))}
                </span>
              </p>
              <p>
                Remaining:{" "}
                <span className="font-semibold text-[var(--color-text)]">
                  {toPeso(Number(stay.balance_due || 0))}
                </span>
              </p>
              <p className="pt-1 capitalize">
                Status:{" "}
                <span className="font-semibold text-[var(--color-text)]">
                  {stay.status.replaceAll("_", " ")}
                </span>
              </p>
            </div>
          </section>
        </div>
      )}
    </GuestShell>
  );
}
