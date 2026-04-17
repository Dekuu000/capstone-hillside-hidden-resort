"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";

type UnitImageGalleryProps = {
  images: string[];
  thumbs?: string[];
  altBase: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenLightbox?: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  emptyText?: string;
  className?: string;
};

export function UnitImageGallery({
  images,
  thumbs,
  altBase,
  selectedIndex,
  onSelect,
  onOpenLightbox,
  onReorder,
  emptyText = "No photos yet. Upload to help guests choose.",
  className = "",
}: UnitImageGalleryProps) {
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!images.length) {
    return (
      <div className={`rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-muted)] ${className}`}>
        {emptyText}
      </div>
    );
  }

  const activeIndex = Math.max(0, Math.min(selectedIndex, images.length - 1));
  const activeImage = images[activeIndex];
  const activeThumbs = thumbs && thumbs.length ? thumbs : images;
  const canNavigate = images.length > 1;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-slate-100">
        <button
          type="button"
          onClick={() => onOpenLightbox?.(activeIndex)}
          className="group relative block h-56 w-full cursor-zoom-in bg-slate-100 md:h-64"
        >
          <Image
            src={activeImage}
            alt={`${altBase} photo ${activeIndex + 1}`}
            fill
            sizes="(min-width: 768px) 40vw, 90vw"
            className="object-cover"
          />
          <span className="pointer-events-none absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Expand className="h-4 w-4" />
          </span>
        </button>
        {canNavigate ? (
          <>
            <button
              type="button"
              onClick={() => onSelect((activeIndex - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white transition-colors duration-150 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onSelect((activeIndex + 1) % images.length)}
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white transition-colors duration-150 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            draggable={Boolean(onReorder)}
            onClick={() => onSelect(index)}
            onDragStart={() => {
              if (!onReorder) return;
              setDragFromIndex(index);
              setDragOverIndex(index);
            }}
            onDragOver={(event) => {
              if (!onReorder || dragFromIndex === null) return;
              event.preventDefault();
              if (dragOverIndex !== index) {
                setDragOverIndex(index);
              }
            }}
            onDrop={(event) => {
              if (!onReorder || dragFromIndex === null) return;
              event.preventDefault();
              if (dragFromIndex !== index) {
                onReorder(dragFromIndex, index);
              }
              setDragFromIndex(null);
              setDragOverIndex(null);
            }}
            onDragEnd={() => {
              setDragFromIndex(null);
              setDragOverIndex(null);
            }}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              index === activeIndex
                ? "border-[var(--color-primary)]"
                : dragOverIndex === index && dragFromIndex !== null && dragFromIndex !== index
                  ? "border-[var(--color-secondary)]"
                  : "border-[var(--color-border)]"
            }`}
            aria-label={`Preview photo ${index + 1}`}
          >
            <Image
              src={activeThumbs[index] || image}
              alt={`${altBase} thumbnail ${index + 1}`}
              fill
              sizes="64px"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
