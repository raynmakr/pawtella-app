export type UploadKind = "image" | "video";

/** POST /api/upload */
export interface UploadSignature {
  mock: boolean;
  isMock?: boolean;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: UploadKind;
  uploadUrl: string;
  kind: UploadKind;
}

export interface UploadedAsset {
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: UploadKind;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  mock?: boolean;
}
