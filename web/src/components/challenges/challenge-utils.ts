import { differenceInHours, differenceInDays, formatDistanceToNowStrict, isPast, parseISO } from "date-fns";
import type { Challenge } from "@/types/challenge";

export function daysLeft(endsAt: string): string {
  const end = parseISO(endsAt);
  if (isPast(end)) return "Ended";
  const days = differenceInDays(end, new Date());
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.max(1, differenceInHours(end, new Date()));
  return `${hours} hour${hours === 1 ? "" : "s"} left`;
}

export function startsIn(startsAt: string): string {
  return `Starts ${formatDistanceToNowStrict(parseISO(startsAt), { addSuffix: true })}`;
}

export function studioHref(ch: Pick<Challenge, "id" | "presetId">): string {
  const p = new URLSearchParams({ challengeId: String(ch.id) });
  if (ch.presetId) p.set("presetId", ch.presetId);
  return `/studio?${p.toString()}`;
}

export function postHref(ch: Pick<Challenge, "id">): string {
  return `/post/new?challengeId=${ch.id}`;
}
