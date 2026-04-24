import { BookNowClient } from "../../components/book/BookNowClient";
import { GuestShell } from "../../components/layout/GuestShell";
import { availableUnitsResponseSchema } from "../../../packages/shared/src/schemas";
import type { AvailableUnitsResponse } from "../../../packages/shared/src/types";
import { fetchServerApiData } from "../../lib/serverApi";
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
): Promise<AvailableUnitsResponse | null> {
  const qs = new URLSearchParams({
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
  });
  return fetchServerApiData({
    accessToken,
    path: `/v2/catalog/units/available?${qs.toString()}`,
    schema: availableUnitsResponseSchema,
    revalidate: 0,
  });
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
    <GuestShell initialEmail={emailHint}>
      <BookNowClient
        initialToken={accessToken}
        initialSessionEmail={emailHint}
        initialCheckInDate={checkInDate}
        initialCheckOutDate={checkOutDate}
        initialUnitsData={initialUnitsData}
      />
    </GuestShell>
  );
}

