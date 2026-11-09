"use client";

import Link from "next/link";
import {
  ChevronRightIcon,
  CoinsIcon,
  GiftIcon,
  HandshakeIcon,
  ImagePlusIcon,
  PackageIcon,
  RefreshCwIcon,
  SettingsIcon,
  StoreIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PointsPill } from "@/components/points-pill";
import { ErrorState } from "@/components/error-state";
import { useSession } from "@/stores/session";
import { useProfile } from "@/hooks/use-profile";
import { usePartnerMe } from "@/hooks/use-partners";
import { ProfileHeader } from "./profile-header";
import { PetsCarousel } from "./pets-carousel";
import { UserPostsGrid } from "./posts-grid";

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}

function QuickLinks({ isPartner }: { isPartner: boolean | null }) {
  const links: QuickLink[] = [
    { href: "/points", label: "Paw Points", description: "Balance, history and packs", icon: CoinsIcon, tone: "bg-accent text-points-foreground dark:text-points" },
    { href: "/orders", label: "Orders", description: "Pickup and delivery status", icon: PackageIcon, tone: "bg-teal-soft text-secondary" },
    { href: "/subscriptions", label: "My subscriptions", description: "Auto-ship, save 5–10%", icon: RefreshCwIcon, tone: "bg-coral-soft text-primary" },
    { href: "/invite", label: "Invite friends", description: "Earn +20 PP per friend", icon: GiftIcon, tone: "bg-coral-soft text-primary" },
    { href: "/challenges", label: "Challenges", description: "Weekly themes and winners", icon: TrophyIcon, tone: "bg-accent text-points-foreground dark:text-points" },
    { href: "/partners", label: "Local partners", description: "Vets, groomers and more", icon: StoreIcon, tone: "bg-teal-soft text-secondary" },
    isPartner
      ? { href: "/partner/dashboard", label: "Partner dashboard", description: "Earnings, code and poster", icon: HandshakeIcon, tone: "bg-coral-soft text-primary" }
      : { href: "/partner/apply", label: "Become a partner", description: "Earn 10% on referred orders", icon: HandshakeIcon, tone: "bg-coral-soft text-primary" },
    { href: "/settings", label: "Settings", description: "Profile, theme and account", icon: SettingsIcon, tone: "bg-muted text-muted-foreground" },
  ];
  return (
    <nav aria-label="Profile shortcuts" className="grid gap-2 sm:grid-cols-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="flex items-center gap-3.5 rounded-card bg-card p-3.5 ring-1 ring-border transition hover:ring-primary/40">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${l.tone}`}>
            <l.icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">{l.label}</span>
            <span className="block truncate text-sm text-muted-foreground">{l.description}</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </nav>
  );
}

export function MyProfile() {
  const { user, pets, isLoading } = useSession();
  const profile = useProfile(user?.handle);
  const partner = usePartnerMe();
  const isPartner = partner.isPending ? null : !!partner.data && "earnings" in partner.data;

  if (isLoading || !user) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  const stats = [
    { label: "Posts", value: profile.data?.user.postCount ?? 0 },
    { label: "Followers", value: profile.data?.user.followerCount ?? 0 },
    { label: "Following", value: profile.data?.user.followingCount ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader
        avatarUrl={user.avatarUrl}
        displayName={user.displayName}
        handle={user.handle}
        bio={user.bio}
        stats={stats}
        actions={
          <>
            <PointsPill />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings" />}>
              <SettingsIcon data-icon="inline-start" /> Edit profile
            </Button>
          </>
        }
      />
      {profile.isError && <ErrorState title="Couldn't load your stats" error={profile.error} onRetry={() => profile.refetch()} retrying={profile.isFetching} className="py-6" />}

      <section aria-labelledby="pets-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pets-heading" className="text-lg">
            Your pets
          </h2>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/pets/new" />}>
            Add pet
          </Button>
        </div>
        <PetsCarousel pets={pets} editable />
      </section>

      <QuickLinks isPartner={isPartner} />

      <section aria-labelledby="posts-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="posts-heading" className="text-lg">
            Your posts
          </h2>
          <Button variant="soft" size="sm" nativeButton={false} render={<Link href="/post/new" />}>
            <ImagePlusIcon data-icon="inline-start" /> New post
          </Button>
        </div>
        <UserPostsGrid
          handle={user.handle}
          isMe
          emptyAction={
            <Button nativeButton={false} render={<Link href="/post/new" />}>
              <ImagePlusIcon data-icon="inline-start" /> Post a photo
            </Button>
          }
        />
      </section>
    </div>
  );
}
