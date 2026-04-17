"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type ImageLightboxProps = {
  open: boolean;
  images: string[];
  altBase: string;
  initialIndex?: number;
  onClose: () => void;
};

export function ImageLightbox({
  open,
  images,
  altBase,
  initialIndex = 0,
  onClose,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, Math.min(initialIndex, Math.max(images.length - 1, 0))));
  }, [images.length, initialIndex, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        setIndex((prev) => (prev + 1) % images.length);
      }
      if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        setIndex((prev) => (prev - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [images.length, onClose, open]);

  const activeImage = useMemo(() => images[index] || "", [images, index]);
  if (!open || !images.length || !activeImage) return null;

  const canNavigate = images.length > 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white transition-colors duration-150 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
        aria-label="Close image viewer"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative h-[72vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-black/20">
        <Image
          src={activeImage}
          alt={`${altBase} photo ${index + 1}`}
          fill
          sizes="100vw"
          className="object-contain"
          priority
        />
      </div>

      {canNavigate ? (
        <>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev - 1 + images.length) % images.length)}
            className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/35 text-white transition-colors duration-150 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % images.length)}
            className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/35 text-white transition-colors duration-150 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
            aria-label="Next photo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      <div className="absolute bottom-4 rounded-full border border-white/25 bg-black/35 px-3 py-1 text-xs font-semibold text-white">
        {index + 1} / {images.length}
      </div>
    </div>
  );
}
