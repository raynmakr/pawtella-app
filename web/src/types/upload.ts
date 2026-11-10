export type UploadKind = "image" | "video";

/** Response of POST /api/upload (presign). Mock mode points at the dev data-URL uploader. */
export interface UploadSignature {
  mock: boolean;
  isMock?: boolean;
  kind: UploadKind;
  uploadUrl: string;
  /** Real mode only: */
  key?: string;
  publicUrl?: string;
  contentType?: string;
  maxBytes?: number;
}

/** Response of POST /api/upload/complete (image processing). */
export interface ProcessedImage {
  url: string;
  thumbnailUrl: string | null;
  width: number;
  height: number;
}

export interface UploadedAsset {
  url: string;
  /** Alias of `url`, kept for call sites that read `secureUrl || url`. */
  secureUrl: string;
  thumbnailUrl: string | null;
  resourceType: UploadKind;
  /** Videos only: the original object key the server transcodes asynchronously. */
  mediaKey?: string | null;
  width?: number;
  height?: number;
  duration?: number;
  mock?: boolean;
}
