import { BottomSheet } from "../shared/BottomSheet";

export function SettingsDrawer({
  open,
  scannerId,
  enableSuccessSound,
  enableVibrate,
  onClose,
  onScannerIdChange,
  onSoundChange,
  onVibrateChange,
}: {
  open: boolean;
  scannerId: string;
  enableSuccessSound: boolean;
  enableVibrate: boolean;
  onClose: () => void;
  onScannerIdChange: (value: string) => void;
  onSoundChange: (value: boolean) => void;
  onVibrateChange: (value: boolean) => void;
}) {
  const content = (
    <div className="space-y-3">
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Scanner ID
        <input
          value={scannerId}
          onChange={(event) => onScannerIdChange(event.target.value)}
          className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-normal normal-case text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
        />
      </label>
      <div className="grid gap-2">
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={enableSuccessSound}
            onChange={(event) => onSoundChange(event.target.checked)}
          />
          Success sound
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={enableVibrate}
            onChange={(event) => onVibrateChange(event.target.checked)}
          />
          Vibration feedback
        </label>
      </div>
    </div>
  );

  return (
    <>
      <div className={`fixed inset-y-0 right-0 z-[120] hidden w-[360px] transform border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)] transition sm:block ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="mb-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">Settings</p>
            <p className="text-xs text-[var(--color-muted)]">Scanner and feedback preferences.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
          <button type="button" onClick={onClose} className="mt-3 h-10 rounded-xl border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-text)]">
            Close
          </button>
        </div>
      </div>
      <div className="sm:hidden">
        <BottomSheet open={open} title="Settings" onClose={onClose}>
          {content}
        </BottomSheet>
      </div>
    </>
  );
}
