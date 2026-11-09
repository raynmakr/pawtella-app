"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BanIcon, FlagIcon, Loader2Icon, MoreHorizontalIcon, UserCheckIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ReportDialog } from "@/components/post/report-dialog";
import { useProfile } from "@/hooks/use-profile";
import { useBlockUser, useToggleFollow } from "@/hooks/use-social";
import { useSession } from "@/stores/session";
import { isApiError } from "@/lib/api";
import { ProfileHeader } from "./profile-header";
import { PetsCarousel } from "./pets-carousel";
import { UserPostsGrid } from "./posts-grid";

function RedirectToProfile() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile");
  }, [router]);
  return null;
}

export function PublicProfile({ handle }: { handle: string }) {
  const router = useRouter();
  const { user: me } = useSession();
  const q = useProfile(handle);
  const follow = useToggleFollow(handle);
  const block = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title={`We couldn't find @${handle}`}
          description="This account may not exist, or it isn't available to you."
          action={
            <Button nativeButton={false} render={<Link href="/home" />}>
              Back to the feed
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this profile" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }

  const { user, pets } = q.data;
  const isMe = user.isMe || me?.id === user.id;
  if (isMe) return <RedirectToProfile />;

  const onBlock = async () => {
    await block.mutateAsync(user.handle);
    setBlockOpen(false);
    router.push("/home");
  };

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader
        avatarUrl={user.avatarUrl}
        displayName={user.displayName}
        handle={user.handle}
        bio={user.bio}
        stats={[
          { label: "Posts", value: user.postCount },
          { label: "Followers", value: user.followerCount },
          { label: "Following", value: user.followingCount },
        ]}
        actions={
          <>
            <Button
              variant={user.isFollowing ? "outline" : "default"}
              onClick={() => follow.mutate(user.isFollowing)}
              disabled={follow.isPending || !me}
              aria-pressed={user.isFollowing}
              className="flex-1 sm:flex-none"
            >
              {follow.isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : user.isFollowing ? (
                <UserCheckIcon data-icon="inline-start" />
              ) : (
                <UserPlusIcon data-icon="inline-start" />
              )}
              {user.isFollowing ? "Following" : "Follow"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More options" />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <FlagIcon /> Report user
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setBlockOpen(true)}>
                  <BanIcon /> Block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {pets.length > 0 && (
        <section aria-labelledby="pets-heading">
          <h2 id="pets-heading" className="mb-3 text-lg">
            Pets
          </h2>
          <PetsCarousel pets={pets} />
        </section>
      )}

      <section aria-labelledby="posts-heading">
        <h2 id="posts-heading" className="mb-3 text-lg">
          Posts
        </h2>
        <UserPostsGrid handle={user.handle} />
      </section>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="user" targetId={user.id} label={`@${user.handle}`} />
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="rounded-card p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Block @{user.handle}?</DialogTitle>
            <DialogDescription>You won&apos;t see each other&apos;s posts, comments or profiles. Any follows between you are removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="rounded-b-card">
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onBlock} disabled={block.isPending}>
              {block.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
