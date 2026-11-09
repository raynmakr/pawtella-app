/** Hosts next.config.ts allows the image optimizer to fetch. Anything else renders unoptimized. */
const OPTIMIZED_HOSTS = new Set(["placedog.net", "loremflickr.com", "res.cloudinary.com", "cdn.shopify.com", "cataas.com"]);

export function isOptimizableImage(src: string | null | undefined): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;
  try {
    const u = new URL(src);
    return u.protocol === "https:" && OPTIMIZED_HOSTS.has(u.hostname);
  } catch {
    return src.startsWith("/");
  }
}

export function mediaAspect(width: number | null | undefined, height: number | null | undefined, fallback = 1): number {
  if (!width || !height) return fallback;
  const r = width / height;
  // Keep feed cards between 4:5 and 16:9 to avoid skyscrapers.
  return Math.min(16 / 9, Math.max(4 / 5, r));
}

export function googleMapsUrl(parts: Array<string | null | undefined>, lat?: number | null, lng?: number | null): string {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const q = parts.filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
