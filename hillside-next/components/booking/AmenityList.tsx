import { Bath, Car, Check, Flame, Tent, UtensilsCrossed, Users, Waves, Wifi, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_RULES: Array<[RegExp, LucideIcon]> = [
  [/wi-?fi/i, Wifi],
  [/park/i, Car],
  [/(cr|bath|toilet|shower)/i, Bath],
  [/kitchen|cook|dining/i, UtensilsCrossed],
  [/fan|air|aircon/i, Wind],
  [/pool|water|river/i, Waves],
  [/fire|bonfire|grill|bbq/i, Flame],
  [/hall|stage|event|pavilion/i, Tent],
  [/seat|table|guest|access/i, Users],
];

function iconFor(amenity: string): LucideIcon {
  for (const [re, Icon] of ICON_RULES) {
    if (re.test(amenity)) return Icon;
  }
  return Check;
}

export function AmenityList({ amenities }: { amenities: string[] }) {
  if (!amenities.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {amenities.map((amenity) => {
        const Icon = iconFor(amenity);
        return (
          <div key={amenity} className="flex items-center gap-3 text-sm text-[var(--color-text)]">
            <Icon className="h-5 w-5 shrink-0 text-[var(--color-secondary)]" />
            {amenity}
          </div>
        );
      })}
    </div>
  );
}
