import { Camera, CameraOff, CheckCircle2, ScanLine, SwitchCamera, Zap } from "lucide-react";
import { type StatusPillTone } from "../shared/StatusPill";
import { ScanHints } from "./ScanHints";

// Status dot color over the dark viewport, keyed off the scan status tone.
const TONE_DOT: Record<StatusPillTone, string> = {
  neutral: "bg-white/70",
  info: "bg-[var(--color-secondary)]",
  success: "bg-emerald-400",
  warn: "bg-amber-400",
  error: "bg-red-400",
};

export function CameraScanPanel({
  cameraReaderId,
  statusLabel,
  statusTone,
  scanActive,
  scanLoading,
  permissionError,
  onToggleCamera,
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
  const live = scanActive || scanLoading;
  const dotColor = scanPulse ? "bg-emerald-400" : TONE_DOT[statusTone] ?? "bg-[var(--color-secondary)]";

  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-secondary)]">Check-in</p>
          <h3 className="text-base font-semibold text-[var(--color-text)]">Scan guest QR</h3>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-3xl bg-slate-950 ring-1 ring-black/10 ${
          cameraHeightClassName || "h-[300px] sm:h-[380px] md:h-[440px]"
        }`}
      >
        <div id={cameraReaderId} className="absolute inset-0" />

        {/* Idle: camera not started yet. */}
        {!live ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ScanLine className="h-7 w-7 text-white/80" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-white/90">Camera is off</p>
            <p className="max-w-[240px] text-xs leading-relaxed text-white/55">
              Start the camera, then center the guest&apos;s QR inside the frame.
            </p>
          </div>
        ) : null}

        {/* Live: reticle + spotlight (the dimming comes from .scanner-frame's box-shadow). */}
        {live ? (
          <div className="pointer-events-none absolute inset-0">
            <div
              className={`absolute left-1/2 top-1/2 aspect-square w-[78%] max-w-[300px] -translate-x-1/2 -translate-y-1/2 scanner-frame ${
                scanPulse ? "scanner-frame-detected" : ""
              }`}
            >
              <span className="scanner-corner scanner-corner-tl" />
              <span className="scanner-corner scanner-corner-tr" />
              <span className="scanner-corner scanner-corner-bl" />
              <span className="scanner-corner scanner-corner-br" />
              {scanPulse ? (
                <span className="scanner-success absolute left-1/2 top-1/2">
                  <CheckCircle2 className="h-16 w-16 text-emerald-400" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Floating status chip. */}
        {live ? (
          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-900/55 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-md">
            <span className={`h-2 w-2 rounded-full ${dotColor} ${scanPulse ? "" : "animate-pulse"}`} aria-hidden="true" />
            {statusLabel}
          </div>
        ) : null}

        {/* Floating camera controls (torch / flip) — glass buttons over the viewport. */}
        {live && showCameraOptions ? (
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            {canSwitchCamera ? (
              <button
                type="button"
                onClick={onSwitchCamera}
                aria-label="Switch camera"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <SwitchCamera className="h-5 w-5" />
              </button>
            ) : null}
            {torchSupported ? (
              <button
                type="button"
                onClick={onToggleTorch}
                aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                aria-pressed={torchOn}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full ring-1 backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  torchOn
                    ? "bg-amber-400/90 text-slate-900 ring-amber-200"
                    : "bg-white/15 text-white ring-white/20 hover:bg-white/25"
                }`}
              >
                <Zap className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Bottom caption. */}
        {live ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <span className="rounded-full bg-slate-900/55 px-3 py-1.5 text-center text-[11px] font-medium text-white/85 ring-1 ring-white/10 backdrop-blur-md">
              {scanPulse ? "QR detected" : "Center the guest's QR in the frame · keep 15–25 cm"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 sm:flex sm:justify-center">
        <button
          type="button"
          onClick={onToggleCamera}
          disabled={scanLoading}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition disabled:opacity-60 sm:w-auto sm:min-w-[260px] ${
            scanActive
              ? "border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-background)]"
              : "bg-[var(--color-primary)] text-white hover:brightness-110"
          }`}
        >
          {scanActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {scanLoading ? "Starting…" : scanActive ? "Stop camera" : "Start camera"}
        </button>
      </div>

      {permissionError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">Camera unavailable</p>
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
