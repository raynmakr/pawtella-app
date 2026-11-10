import { api, ApiError } from "@/lib/api";
import type { UploadKind, UploadSignature, ProcessedImage, UploadedAsset } from "@/types/upload";

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// Trim very large camera photos before upload (bandwidth); the server still resizes to its final
// feed/thumbnail/avatar sizes and strips EXIF. Generous bound so the server's 1080px output isn't
// upscaled from a smaller client crop.
const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

/**
 * Downscale a phone photo to a web-friendly JPEG before upload. Returns the original file untouched
 * for non-images, GIFs, in non-browser contexts, or if anything goes wrong.
 */
export async function compressImage(file: File | Blob): Promise<File | Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    // Flatten transparency onto white so PNGs with alpha don't become black when encoded as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Only adopt the re-encoded version if it actually shrank the file.
    if (blob && blob.size > 0 && blob.size < file.size) return blob;
    return file;
  } catch {
    return file;
  }
}

/** PUT raw bytes to a presigned storage URL, reporting coarse progress via XHR. */
function putToStorage(url: string, body: Blob, contentType: string, onProgress?: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(0.15 + 0.7 * (e.loaded / e.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, `Upload failed (${xhr.status})`, xhr.responseText)));
    xhr.onerror = () => reject(new ApiError(0, "Upload failed (network error)"));
    xhr.send(body);
  });
}

/**
 * Upload a file. Asks the API for a presigned PUT and uploads directly to object storage (so the
 * 4.5 MB serverless body limit never applies); photos are then processed into sized WebP variants,
 * videos return the original and are transcoded server-side. In mock mode (no storage configured)
 * it falls back to sending a data URL to /api/upload/mock.
 */
export async function uploadFile(
  file: File | Blob,
  opts: { kind?: UploadKind; folder?: string; variant?: "feed" | "avatar"; onProgress?: (fraction: number) => void } = {},
): Promise<UploadedAsset> {
  const kind: UploadKind = opts.kind ?? (file.type.startsWith("video/") ? "video" : "image");
  const payload = kind === "image" ? await compressImage(file) : file;
  const contentType = payload.type || (kind === "video" ? "video/mp4" : "image/jpeg");

  const sig = await api<UploadSignature>("/api/upload", { method: "POST", json: { kind, contentType, size: payload.size } });
  opts.onProgress?.(0.1);

  if (sig.mock || sig.isMock) {
    const dataUrl = await fileToDataUrl(payload);
    opts.onProgress?.(0.5);
    const out = await api<{ url: string; secureUrl: string; thumbnailUrl?: string | null }>("/api/upload/mock", { method: "POST", json: { dataUrl } });
    opts.onProgress?.(1);
    return { url: out.url, secureUrl: out.secureUrl, thumbnailUrl: out.thumbnailUrl ?? null, resourceType: kind, mock: true };
  }

  await putToStorage(sig.uploadUrl, payload, sig.contentType ?? contentType, opts.onProgress);
  opts.onProgress?.(0.9);

  if (kind === "image") {
    const res = await api<ProcessedImage>("/api/upload/complete", { method: "POST", json: { key: sig.key, variant: opts.variant ?? "feed" } });
    opts.onProgress?.(1);
    return { url: res.url, secureUrl: res.url, thumbnailUrl: res.thumbnailUrl, width: res.width, height: res.height, resourceType: "image", mock: false };
  }

  // Video: no synchronous processing step — the post stores the original + key and the server
  // transcodes it in the background. The original plays in the feed until that completes.
  opts.onProgress?.(1);
  return { url: sig.publicUrl!, secureUrl: sig.publicUrl!, thumbnailUrl: null, mediaKey: sig.key ?? null, resourceType: "video", mock: false };
}

export const uploadService = { uploadFile, fileToDataUrl, compressImage };
