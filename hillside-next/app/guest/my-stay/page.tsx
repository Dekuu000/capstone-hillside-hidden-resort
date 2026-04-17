import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { stayDashboardResponseSchema } from "../../../../packages/shared/src/schemas";
import type { ReservationListItem, StayDashboardResponse } from "../../../../packages/shared/src/types";
import { MyStayDashboardClient } from "../../../components/guest-stay/MyStayDashboardClient";
import { GuestShell } from "../../../components/layout/GuestShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/shared/Badge";
import { NetworkStatusBadge } from "../../../components/shared/NetworkStatusBadge";
import { getServerAccessToken, getServerEmailHint } from "../../../lib/serverAuth";

const guestPassSchema = z.object({
  minted: z.boolean(),
  chain_key: z.string().nullable().optional(),
  contract_address: z.string().nullable().optional(),
  token_id: z.number().nullable().optional(),
  tx_hash: z.string().nullable().optional(),
});

function shortHash(value: string) {
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function explorerTxUrl(chainKey: string | null | undefined, txHash: string | null | undefined) {
  if (!txHash) return null;
  const normalized = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  if (chainKey === "amoy") return `https://amoy.polygonscan.com/tx/${normalized}`;
  return `https://sepolia.etherscan.io/tx/${normalized}`;
}

function explorerTokenUrl(
  chainKey: string | null | undefined,
  contractAddress: string | null | undefined,
  tokenId: number | null | undefined,
) {
  if (!contractAddress || tokenId == null) return null;
  if (chainKey === "amoy") return `https://amoy.polygonscan.com/token/${contractAddress}?a=${tokenId}`;
  return `https://sepolia.etherscan.io/token/${contractAddress}?a=${tokenId}`;
}

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
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

async function fetchStayDashboard(accessToken: string): Promise<StayDashboardResponse | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(`${base}/v2/me/stay-dashboard`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = stayDashboardResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

async function fetchGuestPass(accessToken: string, reservationId: string) {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(`${base}/v2/nft/guest-pass/${reservationId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = guestPassSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

export default async function GuestMyStayPage() {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login?next=/guest/my-stay");

  const emailHint = await getServerEmailHint();
  const stayDashboard = await fetchStayDashboard(accessToken);
  const stay = stayDashboard?.reservation ?? null;
  const welcomeNotification = stayDashboard?.welcome_notification ?? null;
  const guestPass = stay ? await fetchGuestPass(accessToken, stay.reservation_id) : null;

  return (
    <GuestShell initialEmail={emailHint}>
      <PageHeader
        title="My Stay"
        subtitle="Track your check-in readiness and show QR to front desk staff."
        statusSlot={(
          <>
            <NetworkStatusBadge />
            <Badge label="Offline-friendly QR" variant="info" />
          </>
        )}
      />
      {!stay ? (
        <section className="surface p-5">
          <p className="text-sm text-[var(--color-muted)]">
            No active stay yet. Your check-in dashboard appears once a reservation becomes active.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
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

          <section className="grid gap-4 md:grid-cols-2">
            <article className="surface p-5">
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
            </article>

            <article className="surface p-5">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
                <KeyRound className="h-4 w-4 text-[var(--color-secondary)]" />
                Digital Guest Pass
              </h2>
              <div className="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
                <p>
                  Mint status:{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {guestPass?.minted ? "Minted" : "Pending"}
                  </span>
                </p>
                <p>
                  Token ID:{" "}
                  {guestPass?.token_id != null && guestPass.contract_address ? (
                    <a
                      href={explorerTokenUrl(guestPass?.chain_key, guestPass.contract_address, guestPass.token_id) || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-blue-800"
                      aria-label={`View token ${guestPass.token_id} on explorer`}
                    >
                      {guestPass.token_id}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="font-semibold text-[var(--color-text)]">{guestPass?.token_id ?? "-"}</span>
                  )}
                </p>
                <p>
                  Tx:{" "}
                  {guestPass?.tx_hash ? (
                    <span className="relative inline-flex items-center">
                      <a
                        href={explorerTxUrl(guestPass?.chain_key, guestPass.tx_hash) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-center gap-1 text-[var(--color-secondary)]"
                        aria-label={guestPass.tx_hash}
                      >
                        <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-blue-800">
                          {shortHash(guestPass.tx_hash)}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden rounded-md bg-[#1e2b3f] px-2 py-1 font-mono text-[11px] text-slate-100 shadow-lg group-hover:block group-focus-visible:block">
                          {guestPass.tx_hash}
                        </span>
                      </a>
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-[var(--color-text)]">-</span>
                  )}
                </p>
              </div>
            </article>
          </section>
        </div>
      )}
    </GuestShell>
  );
}
