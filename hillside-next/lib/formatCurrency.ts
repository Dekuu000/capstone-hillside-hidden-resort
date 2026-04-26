const phpPesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export function formatPhpPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return phpPesoFormatter.format(Number.isFinite(amount) ? amount : 0);
}
