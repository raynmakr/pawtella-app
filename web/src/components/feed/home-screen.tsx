"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CompassIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { ChallengeBanner } from "./challenge-banner";
import { FeedList } from "./feed-list";

type Tab = "following" | "discover";

function HomeInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "following" ? "following" : "discover";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params.toString());
    if (t === "discover") next.delete("tab");
    else next.set("tab", t);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl">Home</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Feed" className="h-10 rounded-full bg-muted p-1">
            <TabsTrigger value="following" className="h-8 rounded-full px-4 text-sm font-semibold data-active:text-primary">
              <UsersIcon data-icon="inline-start" /> Following
            </TabsTrigger>
            <TabsTrigger value="discover" className="h-8 rounded-full px-4 text-sm font-semibold data-active:text-primary">
              <CompassIcon data-icon="inline-start" /> Discover
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ChallengeBanner />
      {tab === "following" ? (
        <FeedList
          mode="following"
          empty={
            <EmptyState
              icon={<UsersIcon />}
              title="Your Following feed is quiet"
              description="Follow a few pet parents and their posts will show up here. Discover is full of them."
              action={
                <Button onClick={() => setTab("discover")}>
                  <CompassIcon data-icon="inline-start" /> Browse Discover
                </Button>
              }
            />
          }
        />
      ) : (
        <FeedList
          mode="discover"
          empty={
            <EmptyState
              title="Nothing here yet"
              description="Be the first to post. Share a photo or video of your pet and start the feed."
              action={
                <Button nativeButton={false} render={<Link href="/post/new" />}>
                  Post a photo
                </Button>
              }
            />
          }
        />
      )}
    </div>
  );
}

export function HomeScreen() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
