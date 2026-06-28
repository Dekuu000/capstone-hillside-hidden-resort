import { MapPin } from "lucide-react";

/** Styled, non-interactive map panel (placeholder until a real map is wired). */
export function MapPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-[var(--color-border)] ${className || ""}`}
      style={{
        backgroundColor: "#eef2ea",
        backgroundImage:
          "linear-gradient(color-mix(in srgb, var(--color-primary) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 8%, transparent) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
      aria-label="Map of Hillside Hidden Resort"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-md)]">
          <MapPin className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-[var(--color-text)]">Hillside Hidden Resort</p>
        <p className="text-xs muted-text">Olongapo City, Zambales</p>
      </div>
    </div>
  );
}
