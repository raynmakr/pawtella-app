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

/**
 * Upload a file. Asks the API for signed Cloudinary params; in mock mode (no Cloudinary keys)
 * it sends a data URL to the API's /api/upload/mock instead. Returns the hosted URL.
 */
export async function uploadFile(
  file: File | Blob,
  opts: { kind?: UploadKind; folder?: string; onProgress?: (fraction: number) => void } = {},
): Promise<UploadedAsset> {
  const kind: UploadKind = opts.kind ?? (file.type.startsWith("video/") ? "video" : "image");
  const sig = await api<UploadSignature>("/api/upload", { method: "POST", json: { kind, folder: opts.folder } });
  opts.onProgress?.(0.15);
  if (sig.mock || sig.isMock) {
    const dataUrl = await fileToDataUrl(file);
    opts.onProgress?.(0.5);
    const out = await api<UploadedAsset>("/api/upload/mock", { method: "POST", json: { dataUrl } });
    opts.onProgress?.(1);
    return out;
  }
  const form = new FormData();
  form.append("file", file);
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

export const uploadService = { uploadFile, fileToDataUrl };
