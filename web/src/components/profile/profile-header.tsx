"use client";

import { UserAvatar } from "@/components/avatars";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: number;
}

interface ProfileHeaderProps {
  avatarUrl: string | null;
  displayName: string | null;
  handle: string;
  bio: string | null;
  stats: Stat[];
  /** Right side on desktop, below on mobile: follow button, points pill, edit link... */
  actions?: React.ReactNode;
  className?: string;
}

export function ProfileHeader({ avatarUrl, displayName, handle, bio, stats, actions, className }: ProfileHeaderProps) {
  return (
    <header className={cn("rounded-card bg-card p-5 shadow-soft ring-1 ring-border sm:p-6", className)}>
      <div className="flex items-start gap-4 sm:gap-6">
        <UserAvatar src={avatarUrl} name={displayName ?? handle} size="xl" className="shrink-0 ring-4 ring-coral-soft sm:size-28 sm:text-4xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl sm:text-3xl">{displayName ?? handle}</h1>
              <p className="text-sm font-medium text-muted-foreground">@{handle}</p>
            </div>
            {actions && <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>}
          </div>
          <dl className="mt-3 flex gap-5">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse sm:flex-row sm:items-baseline sm:gap-1.5">
                <dt className="text-xs text-muted-foreground sm:text-sm">{s.label}</dt>
                <dd className="font-heading text-lg font-extrabold tabular-nums sm:text-xl">{formatPoints(s.value)}</dd>
              </div>
            ))}
          </dl>
          {bio && <p className="mt-3 hidden max-w-prose text-[15px] leading-relaxed sm:block">{bio}</p>}
        </div>
      </div>
      {bio && <p className="mt-4 text-[15px] leading-relaxed sm:hidden">{bio}</p>}
      {actions && <div className="mt-4 flex items-center gap-2 sm:hidden">{actions}</div>}
    </header>
  );
}
