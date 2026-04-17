import { Lightbulb } from "lucide-react";

export function ScanHints({
  visible,
  hint,
}: {
  visible: boolean;
  hint: string;
}) {
  if (!visible) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-text)]">
      <div className="inline-flex items-center gap-1.5 font-semibold">
        <Lightbulb className="h-3.5 w-3.5" />
        Scan tip
      </div>
      <p className="mt-1 text-[var(--color-muted)]">{hint}</p>
    </div>
  );
}

