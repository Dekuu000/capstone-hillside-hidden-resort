"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, LayoutGrid, X } from "lucide-react";

/**
 * Listing photo gallery. Adapts the desktop collage to the number of photos
 * (1 / 2 / 3 / 4 / 5+) so any count looks intentional, and opens a full-screen
 * lightbox (keyboard + swipe-friendly) so ALL photos are viewable — not just
 * the 5 shown in the collage.
 */
export function ListingGallery({ images, alt }: { images: string[]; alt: string }) {
  const photos = images.filter(Boolean);
  const count = photos.length;
  const [lightbox, setLightbox] = useState<number | null>(null);

  const open = (index: number) => setLightbox(index);
  const close = useCallback(() => setLightbox(null), []);
  const prev = useCallback(() => setLightbox((i) => (i === null ? i : (i - 1 + count) % count)), [count]);
  const next = useCallback(() => setLightbox((i) => (i === null ? i : (i + 1) % count)), [count]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") prev();
      else if (event.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox, close, prev, next]);

  if (count === 0) return null;

  // A clickable image cell (function, not a nested component, to avoid remounts).
  const tile = (
    src: string,
    index: number,
    opts: { priority?: boolean; sizes: string; className?: string },
  ): ReactNode => (
    <button
      key={`${src}-${index}`}
      type="button"
      onClick={() => open(index)}
      aria-label={`View photo ${index + 1} of ${count}`}
      className={`group relative overflow-hidden focus-visible:outline-none ${opts.className ?? ""}`}
    >
      <Image
        src={src}
        alt={`${alt} photo ${index + 1}`}
        fill
        priority={opts.priority}
        sizes={opts.sizes}
        className="object-cover transition duration-300 group-hover:scale-[1.03]"
      />
    </button>
  );

  const showAll = (
    <button
      type="button"
      onClick={() => open(0)}
      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-sm backdrop-blur transition hover:bg-white"
    >
      <LayoutGrid className="h-3.5 w-3.5" />
      Show all photos ({count})
    </button>
  );

  return (
    <div className="relative">
      {/* Mobile: single hero, tap to open the full set. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl md:hidden">
        {tile(photos[0], 0, { priority: true, sizes: "100vw", className: "h-full w-full" })}
        {count > 1 ? showAll : null}
      </div>

      {/* Desktop: layout adapts to the photo count. */}
      <div className="hidden h-[440px] overflow-hidden rounded-3xl md:block">
        {count === 1 ? (
          tile(photos[0], 0, { priority: true, sizes: "100vw", className: "h-full w-full" })
        ) : count === 2 ? (
          <div className="grid h-full grid-cols-2 gap-2">
            {photos.slice(0, 2).map((src, i) => tile(src, i, { priority: i === 0, sizes: "50vw" }))}
          </div>
        ) : count === 3 ? (
          <div className="grid h-full grid-cols-3 grid-rows-2 gap-2">
            {tile(photos[0], 0, { priority: true, sizes: "66vw", className: "col-span-2 row-span-2" })}
            {tile(photos[1], 1, { sizes: "33vw" })}
            {tile(photos[2], 2, { sizes: "33vw" })}
          </div>
        ) : count === 4 ? (
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
            {photos.slice(0, 4).map((src, i) => tile(src, i, { priority: i === 0, sizes: "50vw" }))}
          </div>
        ) : (
          <div className="grid h-full grid-cols-4 grid-rows-2 gap-2">
            {tile(photos[0], 0, { priority: true, sizes: "50vw", className: "col-span-2 row-span-2" })}
            {photos.slice(1, 5).map((src, i) => tile(src, i + 1, { sizes: "25vw" }))}
          </div>
        )}
      </div>
      {/* "Show all" on desktop when the collage can't show everything. */}
      <div className="hidden md:block">{count > 5 ? showAll : null}</div>

      {/* Full-screen lightbox */}
      {lightbox !== null ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} photo viewer`}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {count > 1 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                prev();
              }}
              aria-label="Previous photo"
              className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}
          <div className="relative h-[80vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <Image src={photos[lightbox]} alt={`${alt} photo ${lightbox + 1}`} fill sizes="100vw" className="object-contain" />
          </div>
          {count > 1 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                next();
              }}
              aria-label="Next photo"
              className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            {lightbox + 1} / {count}
          </span>
        </div>
      ) : null}
    </div>
  );
}
