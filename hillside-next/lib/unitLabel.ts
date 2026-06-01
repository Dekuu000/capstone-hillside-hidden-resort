export type UnitLabel = {
  title: string;
  subtitle?: string | null;
};

export function getUnitLabel(name: string): UnitLabel {
  const trimmed = (name || "").trim();
  const luxeMatch = /^luxe hideaway(?:\s+(\d+))?$/i.exec(trimmed);
  if (luxeMatch) {
    return {
      title: "Luxe Hideaway",
      subtitle: luxeMatch[1] ? `Unit ${luxeMatch[1]}` : null,
    };
  }
  return { title: trimmed || "Unit", subtitle: null };
}
