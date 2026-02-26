import { BookNowClient } from "../../components/book/BookNowClient";
import { GuestChrome } from "../../components/layout/GuestChrome";
import { getServerAccessToken, getServerAuthContext, getServerEmailHint } from "../../lib/serverAuth";

function isoLocalDate(dayOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchInitialAvailableUnits(
  accessToken: string,
  checkInDate: string,
  checkOutDate: string,
) {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const qs = new URLSearchParams({
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
  });
  const response = await fetch(`${base}/v2/catalog/units/available?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function BookPage() {
  const checkInDate = isoLocalDate(1);
  const checkOutDate = isoLocalDate(3);

  const accessToken = await getServerAccessToken();
  const auth = accessToken ? await getServerAuthContext(accessToken) : null;
  const emailHint = auth?.email || (await getServerEmailHint());
  const initialUnitsData = accessToken
    ? await fetchInitialAvailableUnits(accessToken, checkInDate, checkOutDate)
    : null;

  return (
    <GuestChrome initialEmail={emailHint}>
      <BookNowClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialCheckInDate={checkInDate}
        initialCheckOutDate={checkOutDate}
        initialUnitsData={initialUnitsData}
      />
    </GuestChrome>
  );
}

