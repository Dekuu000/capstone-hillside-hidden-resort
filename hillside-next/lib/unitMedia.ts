"use client";

import { env } from "./env";

export const UNIT_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const UNIT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const UNIT_IMAGE_MAX_COUNT = 20;
export const UNIT_IMAGES_BUCKET = "unit-images";

export function normalizeUnitImageUrls(
  imageUrls?: string[] | null,
  imageUrl?: string | null,
): string[] {
  const normalized = (imageUrls ?? []).map((value) => value?.trim()).filter(Boolean) as string[];
  if (!normalized.length && imageUrl?.trim()) {
    normalized.push(imageUrl.trim());
  }
  return normalized;
}

export function normalizeUnitThumbUrls(
  images: string[],
  thumbUrls?: (string | null | undefined)[] | null,
): string[] {
  const normalizedThumbs = (thumbUrls ?? [])
    .map((value) => (value || "").trim())
    .filter(Boolean);
  return images.map((image, index) => normalizedThumbs[index] || image);
}

export function validateUnitImageFile(file: File): string | null {
  if (!UNIT_IMAGE_ALLOWED_TYPES.includes(file.type as (typeof UNIT_IMAGE_ALLOWED_TYPES)[number])) {
    return "Only JPG, PNG, and WEBP are supported.";
  }
  if (file.size > UNIT_IMAGE_MAX_BYTES) {
    return "Max file size is 5MB.";
  }
  return null;
}

function toWebpBlob(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to generate image blob."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function loadImageElement(source: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(source);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image."));
    };
    image.src = objectUrl;
  });
}

export async function resizeImageToWebp(source: File, maxWidth: number): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("Image resizing is only available in browser context.");
  }

  const bitmap = "createImageBitmap" in window ? await createImageBitmap(source).catch(() => null) : null;
  const width = bitmap ? bitmap.width : 0;
  const height = bitmap ? bitmap.height : 0;
  let sourceWidth = width;
  let sourceHeight = height;
  let sourceImage: HTMLImageElement | null = null;

  if (!bitmap) {
    sourceImage = await loadImageElement(source);
    sourceWidth = sourceImage.naturalWidth;
    sourceHeight = sourceImage.naturalHeight;
  }

  const targetWidth = Math.max(1, Math.min(maxWidth, sourceWidth || maxWidth));
  const scale = sourceWidth > 0 ? targetWidth / sourceWidth : 1;
  const targetHeight = Math.max(1, Math.round((sourceHeight || targetWidth) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  if (bitmap) {
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
  } else if (sourceImage) {
    context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
  }

  return toWebpBlob(canvas);
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildUnitImagePublicUrl(path: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${UNIT_IMAGES_BUCKET}/${path}`;
}

export type UploadWithProgressArgs = {
  token: string;
  path: string;
  blob: Blob;
  onProgress?: (percent: number) => void;
};

export function uploadUnitImageBlob({
  token,
  path,
  blob,
  onProgress,
}: UploadWithProgressArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    const base = env.supabaseUrl.replace(/\/+$/, "");
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${base}/storage/v1/object/${UNIT_IMAGES_BUCKET}/${encodeStoragePath(path)}`,
      true,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", env.supabasePublishableKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", blob.type || "image/webp");
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(buildUnitImagePublicUrl(path));
        return;
      }
      reject(new Error(xhr.responseText || `Upload failed (${xhr.status}).`));
    };
    xhr.send(blob);
  });
}

export function extractManagedUnitImagePath(url: string): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("units/")) {
    return trimmed.split("?")[0].split("#")[0];
  }
  const marker = `/storage/v1/object/public/${UNIT_IMAGES_BUCKET}/`;
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex < 0) return null;
  const raw = trimmed.slice(markerIndex + marker.length).split("?")[0].split("#")[0];
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  return decoded.startsWith("units/") ? decoded : null;
}

export async function deleteManagedUnitImageUrls(
  token: string,
  urls: string[],
): Promise<void> {
  const paths = urls
    .map((value) => extractManagedUnitImagePath(value))
    .filter(Boolean) as string[];
  if (!paths.length) return;

  const base = env.supabaseUrl.replace(/\/+$/, "");
  await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(
        `${base}/storage/v1/object/${UNIT_IMAGES_BUCKET}/${encodeStoragePath(path)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.supabasePublishableKey,
          },
        },
      );
      if (!response.ok && response.status !== 404) {
        const message = await response.text();
        throw new Error(message || `Failed to delete ${path}.`);
      }
    }),
  );
}
