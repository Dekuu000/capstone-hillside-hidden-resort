import { useEffect, useState } from "react";
import { Camera, CameraOff, Ellipsis, RefreshCcw, Repeat2, Flashlight } from "lucide-react";
import { StatusPill, type StatusPillTone } from "../shared/StatusPill";
import { ScanHints } from "./ScanHints";

export function CameraScanPanel({
  cameraReaderId,
  statusLabel,
  statusTone,
  scanActive,
  scanLoading,
  permissionError,
  onToggleCamera,
  onReset,
  onRetryPermission,
  canSwitchCamera,
  onSwitchCamera,
  torchSupported,
  torchOn,
  onToggleTorch,
  showCameraOptions,
  scanPulse,
  showHints,
  hint,
  cameraHeightClassName,
}: {
  cameraReaderId: string;
  statusLabel: string;
  statusTone: StatusPillTone;
  scanActive: boolean;
  scanLoading: boolean;
  permissionError?: string | null;
  onToggleCamera: () => void;
  onReset: () => void;
  onRetryPermission: () => void;
  canSwitchCamera: boolean;
  onSwitchCamera: () => void;
  torchSupported: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  showCameraOptions: boolean;
  scanPulse: boolean;
  showHints: boolean;
  hint: string;
  cameraHeightClassName?: string;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);

  useEffect(() => {
    if (!scanActive) setOptionsOpen(false);
  }, [scanActive]);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)]">Scan Camera</p>
        <div className="relative flex items-center gap-2">
          <StatusPill label={statusLabel} tone={statusTone} />
          {scanActive && showCameraOptions ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOptionsOpen((prev) => !prev)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
                aria-label="Camera options"
              >
                <Ellipsis className="h-4 w-4" />
              </button>
              {optionsOpen ? (
                <div className="absolute right-0 top-12 z-20 min-w-[160px] rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-md)]">
                  {canSwitchCamera ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchCamera();
                        setOptionsOpen(false);
                      }}
                      className="inline-flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50"
                    >
                      <Repeat2 className="h-4 w-4" />
                      Switch camera
                    </button>
                  ) : null}
                  {torchSupported ? (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTorch();
                        setOptionsOpen(false);
                      }}
                      className="inline-flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50"
                    >
                      <Flashlight className="h-4 w-4" />
                      {torchOn ? "Torch on" : "Torch off"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted)]">Align QR in frame, keep 15-25 cm distance, and fill most of the guide.</p>
      <div className="mt-3 relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-slate-900/10">
        <div id={cameraReaderId} className={cameraHeightClassName || "h-[260px] sm:h-[340px] md:h-[420px]"} />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/35 via-slate-900/5 to-slate-900/35" />
          <div className={`absolute left-1/2 top-1/2 w-[80%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 aspect-square scanner-frame sm:w-[76%] ${scanPulse ? "scanner-frame-detected" : ""}`}>
            <span className="scanner-corner scanner-corner-tl" />
            <span className="scanner-corner scanner-corner-tr" />
            <span className="scanner-corner scanner-corner-bl" />
            <span className="scanner-corner scanner-corner-br" />
            {(scanActive || scanLoading) ? <span className="scanner-sweep" /> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onToggleCamera}
          disabled={scanLoading}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${scanActive ? "border border-[var(--color-border)] bg-white text-[var(--color-text)]" : "bg-[var(--color-cta)] text-white"}`}
        >
          {scanActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {scanLoading ? "Starting..." : scanActive ? "Stop camera" : "Start camera"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          <RefreshCcw className="h-4 w-4" />
          Rescan
        </button>
      </div>

      {permissionError ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">Camera permission required</p>
          <p className="mt-1 text-xs text-red-700">{permissionError}</p>
          <button
            type="button"
            onClick={onRetryPermission}
            className="mt-2 inline-flex h-8 items-center rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700"
          >
            Retry camera
          </button>
        </div>
      ) : null}

      <div className="mt-2">
        <ScanHints visible={showHints} hint={hint} />
      </div>
    </div>
  );
}
