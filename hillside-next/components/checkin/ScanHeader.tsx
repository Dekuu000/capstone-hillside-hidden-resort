import { Settings } from "lucide-react";

export function ScanHeader({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpenSettings}
        className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30 sm:text-sm"
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </button>
    </div>
  );
}
