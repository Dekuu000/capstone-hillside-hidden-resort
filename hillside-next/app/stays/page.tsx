import { getServerAccessToken, getServerAuthContext } from "../../lib/serverAuth";
import { fetchAvailableUnits, fetchPublicUnits, type PublicUnit } from "../../lib/catalog";
import { SearchWidget } from "../../components/booking/SearchWidget";
import { StaysResults } from "../../components/booking/StaysResults";
import { SiteFooter } from "../../components/booking/SiteFooter";
import type { CategoryKey } from "../../components/booking/CategoryFilterRow";

function toCategory(type?: string): CategoryKey {
  if (type === "room" || type === "cottage" || type === "amenity") return type;
  return "all";
}

function formatRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

export default async function StaysPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const checkIn = typeof sp.check_in === "string" ? sp.check_in : undefined;
  const checkOut = typeof sp.check_out === "string" ? sp.check_out : undefined;
  const guestsRaw = typeof sp.guests === "string" ? Number.parseInt(sp.guests, 10) : Number.NaN;
  const guests = Number.isFinite(guestsRaw) && guestsRaw > 0 ? guestsRaw : 2;
  const typeParam = typeof sp.type === "string" ? sp.type : undefined;

  const datesApplied = Boolean(checkIn && checkOut && checkOut > checkIn);

  let units: PublicUnit[];
  if (datesApplied) {
    units =
      (await fetchAvailableUnits({ checkInDate: checkIn!, checkOutDate: checkOut! })) ??
      (await fetchPublicUnits({ limit: 60 }));
  } else {
    units = await fetchPublicUnits({ limit: 60 });
  }

  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;

  return (
    <main className={`flex min-h-screen flex-col bg-[var(--color-background)]${auth ? " pb-[calc(104px_+_env(safe-area-inset-bottom))] md:pb-0" : ""}`}>

      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-6 lg:px-8">
          <SearchWidget initialCheckIn={checkIn} initialCheckOut={checkOut} initialGuests={guests} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-2 pt-6 md:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Stays at Hillside Hidden Resort
        </h1>
        <p className="mt-1 text-sm muted-text">
          {datesApplied
            ? `Available ${formatRange(checkIn!, checkOut!)} · ${guests} ${guests === 1 ? "guest" : "guests"}`
            : "Browse all stays — add dates to check availability."}
        </p>
      </div>

      <StaysResults
        units={units}
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
        initialType={toCategory(typeParam)}
        datesApplied={datesApplied}
      />

      <SiteFooter />
    </main>
  );
}
