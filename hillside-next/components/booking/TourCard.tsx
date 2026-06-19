import Image from "next/image";
import Link from "next/link";
import { Clock } from "lucide-react";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { tourImageUrl, tourSchedule } from "../../lib/catalog";
import type { ServiceItem } from "../../../packages/shared/src/types";

export function TourCard({ service, priority = false }: { service: ServiceItem; priority?: boolean }) {
  const image = tourImageUrl(service);
  const schedule = tourSchedule(service);
  const adultRate = Number(service.adult_rate || 0);

  return (
    <Link href={`/tours/${service.service_id}`} className="group block focus-visible:outline-none">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--color-border)] shadow-[var(--shadow-sm)] transition group-hover:shadow-[var(--shadow-md)]">
        <Image
          src={image}
          alt={service.service_name}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] shadow-sm backdrop-blur">
          Day pass
        </span>
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="font-semibold leading-snug text-[var(--color-text)] group-hover:underline">
          {service.service_name}
        </h3>
        <p className="flex items-center gap-1.5 text-sm muted-text">
          <Clock className="h-3.5 w-3.5" />
          {schedule}
        </p>
        <p className="pt-0.5 text-sm text-[var(--color-text)]">
          {adultRate > 0 ? (
            <>
              <span className="muted-text">from </span>
              <span className="font-semibold">{formatPhpPeso(adultRate)}</span>
              <span className="muted-text"> / adult</span>
            </>
          ) : (
            <span className="font-semibold">See details</span>
          )}
        </p>
      </div>
    </Link>
  );
}
