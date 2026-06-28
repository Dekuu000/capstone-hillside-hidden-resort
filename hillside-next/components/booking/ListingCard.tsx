import Image from "next/image";
import Link from "next/link";
import { Star, Users } from "lucide-react";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { isPaxPricedUnit } from "../../lib/booking/pricing";
import { unitImageUrl, unitTypeLabel, type PublicUnit } from "../../lib/catalog";

type ListingCardProps = {
  unit: PublicUnit;
  /** Optional query string (e.g. dates) carried into the listing detail link. */
  query?: string;
  priority?: boolean;
};

export function ListingCard({ unit, query, priority = false }: ListingCardProps) {
  const image = unitImageUrl(unit);
  const paxPriced = isPaxPricedUnit(unit);
  const href = query ? `/stays/${unit.unit_id}?${query}` : `/stays/${unit.unit_id}`;

  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--color-border)] shadow-[var(--shadow-sm)] transition group-hover:shadow-[var(--shadow-md)]">
        <Image
          src={image}
          alt={`${unit.name} — ${unitTypeLabel(unit.type)} at Hillside Hidden Resort`}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] shadow-sm backdrop-blur">
          {unitTypeLabel(unit.type)}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-[var(--color-text)] group-hover:underline">
            {unit.name}
          </h3>
          {/* Static showcase rating until a reviews system exists. */}
          <span className="flex shrink-0 items-center gap-1 text-sm text-[var(--color-text)]">
            <Star className="h-3.5 w-3.5 fill-[var(--color-star)] text-[var(--color-star)]" />
            4.9
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm muted-text">
          <Users className="h-3.5 w-3.5" />
          Up to {unit.capacity} guests
        </p>
        <p className="pt-0.5 text-sm text-[var(--color-text)]">
          {paxPriced ? (
            <span className="font-semibold">Pricing by group size</span>
          ) : (
            <>
              <span className="font-semibold">{formatPhpPeso(unit.base_price)}</span>
              <span className="muted-text"> / night</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
