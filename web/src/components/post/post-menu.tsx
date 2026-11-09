"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BanIcon, FlagIcon, Link2Icon, Loader2Icon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/stores/session";
import { useBlockUser, } from "@/hooks/use-social";
import { useDeletePost } from "@/hooks/use-posts";
import { copyText, appUrl } from "@/lib/share";
import { errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { ReportDialog } from "./report-dialog";
import type { Post } from "@/types/post";

export function PostMenu({ post, afterDelete }: { post: Pick<Post, "id" | "author" | "userId">; afterDelete?: () => void }) {
  const { user } = useSession();
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const block = useBlockUser();
  const del = useDeletePost();
  const isOwner = user?.id === post.userId || user?.role === "admin";

  const onDelete = async () => {
    try {
      await del.mutateAsync(post.id);
      setDeleteOpen(false);
      toast.success("Post deleted");
      if (afterDelete) afterDelete();
      else router.push("/profile");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the post"));
    }
  };

  const onBlock = async () => {
    await block.mutateAsync(post.author.handle);
    setBlockOpen(false);
    router.push("/home");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More options" className="rounded-full text-muted-foreground" />}>
          <MoreHorizontalIcon className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
          <DropdownMenuItem onClick={() => copyText(appUrl(`/p/${post.id}`), "Link copied")}>
            <Link2Icon /> Copy link
          </DropdownMenuItem>
          {!isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setReportOpen(true)}>
                <FlagIcon /> Report post
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setBlockOpen(true)}>
                <BanIcon /> Block @{post.author.handle}
              </DropdownMenuItem>
            </>
          )}
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon /> Delete post
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="post" targetId={post.id} label={`@${post.author.handle}'s post`} />

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="rounded-card p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Block @{post.author.handle}?</DialogTitle>
            <DialogDescription>
              You won&apos;t see each other&apos;s posts, comments or profiles, and any follows between you are removed. You can unblock later from Settings.
            </DialogDescription>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-card p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Delete this post?</DialogTitle>
            <DialogDescription>This removes the post, its likes and comments for everyone. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="rounded-b-card">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={del.isPending}>
              {del.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
