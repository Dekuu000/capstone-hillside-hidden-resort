import Image from "next/image";

export function ListingGallery({ images, alt }: { images: string[]; alt: string }) {
  const [hero, ...rest] = images;
  const small = rest.slice(0, 4);
  if (!hero) return null;

  return (
    <div className="overflow-hidden rounded-3xl">
      {/* Mobile: single hero image */}
      <div className="relative aspect-[4/3] w-full md:hidden">
        <Image src={hero} alt={alt} fill priority sizes="100vw" className="object-cover" />
      </div>

      {/* Desktop: Airbnb-style 1 + 4 grid (falls back to a single hero if too few photos) */}
      {small.length >= 4 ? (
        <div className="hidden h-[440px] grid-cols-4 grid-rows-2 gap-2 md:grid">
          <div className="relative col-span-2 row-span-2">
            <Image src={hero} alt={alt} fill priority sizes="50vw" className="object-cover" />
          </div>
          {small.map((src, index) => (
            <div key={`${src}-${index}`} className="relative">
              <Image src={src} alt={`${alt} photo ${index + 2}`} fill sizes="25vw" className="object-cover" />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative hidden h-[440px] w-full md:block">
          <Image src={hero} alt={alt} fill priority sizes="100vw" className="object-cover" />
        </div>
      )}
    </div>
  );
}
