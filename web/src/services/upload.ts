import { api, ApiError } from "@/lib/api";
import type { UploadKind, UploadSignature, UploadedAsset } from "@/types/upload";

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

/**
 * Downscale a phone photo to a web-friendly JPEG (longest edge ≤ 1024px) before upload, so large
 * camera images fit the uploader (and, in mock mode, the inline data-URL size budget). Returns the
 * original file untouched for non-images, GIFs, in non-browser contexts, or if anything goes wrong.
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

/**
 * Upload a file. Asks the API for signed Cloudinary params; in mock mode (no Cloudinary keys)
 * it sends a data URL to the API's /api/upload/mock instead. Returns the hosted URL.
 */
export async function uploadFile(
  file: File | Blob,
  opts: { kind?: UploadKind; folder?: string; onProgress?: (fraction: number) => void } = {},
): Promise<UploadedAsset> {
  const kind: UploadKind = opts.kind ?? (file.type.startsWith("video/") ? "video" : "image");
  const payload = kind === "image" ? await compressImage(file) : file;
  const sig = await api<UploadSignature>("/api/upload", { method: "POST", json: { kind, folder: opts.folder } });
  opts.onProgress?.(0.15);
  if (sig.mock || sig.isMock) {
    const dataUrl = await fileToDataUrl(payload);
    opts.onProgress?.(0.5);
    const out = await api<UploadedAsset>("/api/upload/mock", { method: "POST", json: { dataUrl } });
    opts.onProgress?.(1);
    return out;
  }
  const form = new FormData();
  form.append("file", payload);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  const res = await fetch(sig.uploadUrl, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, `Upload failed (${res.status})`, text);
  }
  const data = (await res.json()) as {
    public_id: string;
    url: string;
    secure_url: string;
    resource_type: UploadKind;
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  };
  opts.onProgress?.(1);
  return {
    publicId: data.public_id,
    url: data.url,
    secureUrl: data.secure_url,
    resourceType: data.resource_type,
    width: data.width,
    height: data.height,
    duration: data.duration,
    format: data.format,
    mock: false,
  };
}

export const uploadService = { uploadFile, fileToDataUrl, compressImage };
