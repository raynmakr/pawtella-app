import { formatDistanceToNowStrict, differenceInYears, differenceInMonths, parseISO } from "date-fns";

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function petAge(birthday: string | null | undefined): string | null {
  if (!birthday) return null;
  try {
    const d = parseISO(birthday);
    const years = differenceInYears(new Date(), d);
    if (years >= 1) return `${years} yr${years === 1 ? "" : "s"}`;
    const months = differenceInMonths(new Date(), d);
    return `${Math.max(months, 0)} mo`;
  } catch {
    return null;
  }
}

export function initials(name: string | null | undefined, fallback = "P"): string {
  const s = (name ?? "").trim();
  if (!s) return fallback;
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function formatPoints(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-CA").format(n ?? 0);
}

export function formatCents(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}
