"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Upload, XCircle } from "lucide-react";
import {
  UNIT_IMAGE_MAX_BYTES,
  UNIT_IMAGE_MAX_COUNT,
  uploadUnitImageBlob,
  resizeImageToWebp,
  validateUnitImageFile,
} from "../../lib/unitMedia";

type UploadStatus = "queued" | "processing" | "uploading" | "done" | "failed";

type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
};

type UnitPhotoUploaderProps = {
  token: string;
  unitId: string;
  currentCount: number;
  maxCount?: number;
  onUploaded: (items: { mediumUrl: string; thumbUrl: string }[]) => void;
  onUploadSuccess?: (fileName: string) => void;
  onUploadFailed?: (fileName: string, reason: string) => void;
  onQueueChange?: (count: number) => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UnitPhotoUploader({
  token,
  unitId,
  currentCount,
  maxCount = UNIT_IMAGE_MAX_COUNT,
  onUploaded,
  onUploadSuccess,
  onUploadFailed,
  onQueueChange,
}: UnitPhotoUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runningRef = useRef(false);

  const queuedCount = useMemo(
    () => items.filter((item) => item.status === "queued" || item.status === "processing" || item.status === "uploading").length,
    [items],
  );

  useEffect(() => {
    onQueueChange?.(queuedCount);
  }, [onQueueChange, queuedCount]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const processItem = useCallback(
    async (item: UploadItem) => {
      try {
        updateItem(item.id, { status: "processing", progress: 8, error: undefined });
        const mediumBlob = await resizeImageToWebp(item.file, 1600);
        updateItem(item.id, { status: "processing", progress: 24 });
        const thumbBlob = await resizeImageToWebp(item.file, 320);
        updateItem(item.id, { status: "uploading", progress: 34 });

        const basePath = `units/${unitId}/${crypto.randomUUID()}`;
        const mediumPath = `${basePath}-m.webp`;
        const thumbPath = `${basePath}-t.webp`;

        const mediumUrl = await uploadUnitImageBlob({
          token,
          path: mediumPath,
          blob: mediumBlob,
          onProgress: (percent) => {
            const mapped = 34 + Math.round(percent * 0.5);
            updateItem(item.id, { progress: mapped });
          },
        });
        const thumbUrl = await uploadUnitImageBlob({
          token,
          path: thumbPath,
          blob: thumbBlob,
          onProgress: (percent) => {
            const mapped = 84 + Math.round(percent * 0.16);
            updateItem(item.id, { progress: mapped });
          },
        });

        updateItem(item.id, { status: "done", progress: 100 });
        onUploaded([{ mediumUrl, thumbUrl }]);
        onUploadSuccess?.(item.file.name);
      } catch (unknownError) {
        const reason = unknownError instanceof Error ? unknownError.message : "Upload failed.";
        updateItem(item.id, {
          status: "failed",
          progress: 0,
          error: reason,
        });
        onUploadFailed?.(item.file.name, reason);
      }
    },
    [onUploadFailed, onUploadSuccess, onUploaded, token, unitId, updateItem],
  );

  const processQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (true) {
        const next = (items => items.find((item) => item.status === "queued"))(itemsRef.current);
        if (!next) break;
        await processItem(next);
      }
    } finally {
      runningRef.current = false;
    }
  }, [processItem]);

  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  const enqueueFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const stagedCount = itemsRef.current.filter((item) => item.status !== "failed").length;
      const availableSlots = Math.max(0, maxCount - currentCount - stagedCount);
      if (availableSlots <= 0) {
        setError(`Max ${maxCount} images per unit.`);
        return;
      }

      const incoming = Array.from(fileList).slice(0, availableSlots);
      if (fileList.length > availableSlots) {
        setError(`Only ${availableSlots} file(s) can be added (max ${maxCount}).`);
      } else {
        setError(null);
      }

      const nextRows: UploadItem[] = incoming.map((file) => {
        const validationError = validateUnitImageFile(file);
        return {
          id: crypto.randomUUID(),
          file,
          status: validationError ? "failed" : "queued",
          progress: 0,
          error: validationError || undefined,
        };
      });
      nextRows.forEach((row) => {
        if (row.status === "failed") {
          onUploadFailed?.(row.file.name, row.error || "Upload failed.");
        }
      });

      setItems((prev) => [...prev, ...nextRows]);
      window.setTimeout(() => {
        void processQueue();
      }, 0);
    },
    [currentCount, maxCount, onUploadFailed, processQueue],
  );

  const retryItem = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: "queued", progress: 0, error: undefined }
            : item,
        ),
      );
      window.setTimeout(() => {
        void processQueue();
      }, 0);
    },
    [processQueue],
  );

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Upload photos</p>
          <p className="text-xs text-[var(--color-muted)]">
            JPG, PNG, WEBP • up to {formatFileSize(UNIT_IMAGE_MAX_BYTES)} • max {maxCount}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 text-sm font-semibold text-white transition-colors duration-150 hover:brightness-95"
        >
          <Upload className="h-4 w-4" />
          Add photos
        </button>
      </div>

      <label
        htmlFor="unit-photo-upload"
        className="flex min-h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-3 text-center text-sm text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-primary)]"
      >
        <input
          id="unit-photo-upload"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            enqueueFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <span className="inline-flex items-center gap-2">
          <ImagePlus className="h-4 w-4" />
          Select one or multiple image files
        </span>
      </label>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}

      {!items.length ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-muted)]">
          No photos yet. Upload to help guests choose.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-[var(--color-border)] bg-white p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--color-text)]">{item.file.name}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{formatFileSize(item.file.size)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => retryItem(item.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text)]"
                      aria-label="Retry upload"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)]"
                    aria-label="Remove upload item"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.status === "failed"
                        ? "bg-red-400"
                        : item.status === "done"
                          ? "bg-emerald-500"
                          : "bg-[var(--color-primary)]"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                  {item.status === "processing" || item.status === "uploading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {item.status === "queued" ? "Queued" : null}
                  {item.status === "processing" ? "Preparing image" : null}
                  {item.status === "uploading" ? `Uploading ${item.progress}%` : null}
                  {item.status === "done" ? "Uploaded" : null}
                  {item.status === "failed" ? item.error || "Upload failed" : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {queuedCount > 0 ? (
        <p className="text-[11px] text-[var(--color-muted)]">
          Uploads in progress: {queuedCount}
        </p>
      ) : null}
    </div>
  );
}
