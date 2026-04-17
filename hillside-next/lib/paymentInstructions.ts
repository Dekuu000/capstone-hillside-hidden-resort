function normalize(value: string | undefined): string | null {
  const trimmed = (value || "").trim();
  return trimmed.length ? trimmed : null;
}

export type GuestPaymentInstructions = {
  gcashAccountName: string | null;
  gcashNumber: string | null;
  note: string | null;
};

export function getGuestPaymentInstructions(): GuestPaymentInstructions {
  return {
    gcashAccountName: normalize(process.env.NEXT_PUBLIC_GCASH_ACCOUNT_NAME),
    gcashNumber: normalize(process.env.NEXT_PUBLIC_GCASH_ACCOUNT_NUMBER),
    note: normalize(process.env.NEXT_PUBLIC_GCASH_ACCOUNT_NOTE),
  };
}
