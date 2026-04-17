import Link from "next/link";
import { GuestShell } from "../../components/layout/GuestShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/shared/Badge";
import { Button } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";

export default function GuestShellPage() {
  const hasUpcomingStay = false;

  return (
    <GuestShell>
      <PageHeader
        title="Guest Home"
        subtitle="Manage your stay and access check-in tools from one place."
        statusSlot={
          <>
            <Badge label="Mobile-first" variant="info" />
            <Badge label="Secure QR enabled" variant="success" />
          </>
        }
        rightSlot={
          <Link href="/book">
            <Button>Reserve</Button>
          </Link>
        }
      />
      {hasUpcomingStay ? (
        <section className="surface p-5">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Upcoming Stay</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Countdown, room info, and QR token are available in My Stay.</p>
        </section>
      ) : (
        <div className="space-y-3">
          <EmptyState
            title="No upcoming stay yet"
            description="Start by creating a reservation. Your upcoming stay and QR check-in tools will appear here."
          />
          <div className="flex justify-center">
            <Link href="/book">
              <Button>Reserve now</Button>
            </Link>
          </div>
        </div>
      )}
    </GuestShell>
  );
}
