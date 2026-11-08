"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { socialService } from "@/services/social";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import type { UserProfile } from "@/types/user";
import type { PublicPet } from "@/types/pet";
import type { ReportInput } from "@/types/social";

type ProfileData = { user: UserProfile; pets: PublicPet[] };

/** Follow/unfollow with an optimistic flip of the cached public profile. */
export function useToggleFollow(handle: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (following: boolean) => (following ? socialService.unfollow(handle) : socialService.follow(handle)),
    onMutate: async (following) => {
      await qc.cancelQueries({ queryKey: queryKeys.users.profile(handle) });
      const prev = qc.getQueryData<ProfileData>(queryKeys.users.profile(handle));
      if (prev) {
        qc.setQueryData<ProfileData>(queryKeys.users.profile(handle), {
          ...prev,
          user: { ...prev.user, isFollowing: !following, followerCount: Math.max(0, prev.user.followerCount + (following ? -1 : 1)) },
        });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.users.profile(handle), ctx.prev);
      toast.error(errorMessage(err, "Couldn't update follow"));
    },
    onSuccess: (res) => {
      const prev = qc.getQueryData<ProfileData>(queryKeys.users.profile(handle));
      if (prev) {
        qc.setQueryData<ProfileData>(queryKeys.users.profile(handle), {
          ...prev,
          user: { ...prev.user, isFollowing: res.following, followerCount: res.counts.followers, followingCount: res.counts.following },
        });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.posts.feed("following") });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => socialService.block(handle),
    onSuccess: (_res, handle) => {
      toast.success(`@${handle} blocked. You won't see each other's posts.`);
      void qc.invalidateQueries({ queryKey: queryKeys.posts.all });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: queryKeys.challenges.all });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't block this user")),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (input: ReportInput) => socialService.report(input),
    onSuccess: (res) => {
      toast.success(res.duplicate ? "You already reported this. Thanks, we're on it." : "Thanks for the report. Our team will review it.");
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't send the report")),
  });
}
