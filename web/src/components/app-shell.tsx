"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Footer } from "@/components/footer";
import { TermsAcceptanceBanner } from "@/components/legal/terms-acceptance-banner";
import {
  BellIcon,
  HouseIcon,
  InboxIcon,
  LogOutIcon,
  MessageCircleHeartIcon,
  PlusIcon,
  SettingsIcon,
  ShoppingBagIcon,
  SparklesIcon,
  ImagePlusIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session";
import { useUnreadCount } from "@/hooks/use-notifications";
import { useCartCount } from "@/stores/cart";
import { authService } from "@/services/auth";
import { Logo, PawIcon } from "./logo";
import { PointsPill } from "./points-pill";
import { UserAvatar } from "./avatars";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/ask", label: "Ask", icon: MessageCircleHeartIcon },
  { href: "/create", label: "Create", icon: PlusIcon },
  { href: "/shop", label: "Shop", icon: ShoppingBagIcon },
  { href: "/profile", label: "Profile", icon: UserRoundIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useSignOut() {
  const router = useRouter();
  const qc = useQueryClient();
  const { clear } = useSession();
  return async () => {
    try {
      await authService.logout();
    } catch {
      // cookie clearing is local; ignore
    }
    clear();
    qc.clear();
    router.push("/welcome");
    router.refresh();
    toast.success("Signed out. See you soon!");
  };
}

/** Create hub: "Post a photo or video" and "AI Studio". */
export function CreateDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="pb-safe">
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-xl">What do you want to make?</DrawerTitle>
          <DrawerDescription>Share a moment or let the AI Studio imagine one.</DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-3 px-4 pb-6">
          <button
            type="button"
            onClick={() => go("/post/new")}
            className="flex items-center gap-4 rounded-card bg-card p-4 text-left ring-1 ring-border transition hover:ring-primary/40 active:scale-[0.99]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-soft text-secondary">
              <ImagePlusIcon className="size-6" />
            </span>
            <span>
              <span className="block font-heading text-base font-bold">Post a photo or video</span>
              <span className="block text-sm text-muted-foreground">From your camera roll, with an AI caption.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go("/studio")}
            className="flex items-center gap-4 rounded-card bg-card p-4 text-left ring-1 ring-border transition hover:ring-primary/40 active:scale-[0.99]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
              <SparklesIcon className="size-6" />
            </span>
            <span>
              <span className="block font-heading text-base font-bold">AI Studio</span>
              <span className="block text-sm text-muted-foreground">Turn a pet photo into an image or video.</span>
            </span>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function InboxBell({ className }: { className?: string }) {
  const unread = useUnreadCount();
  const pathname = usePathname();
  return (
    <Link
      href="/inbox"
      aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full text-foreground transition hover:bg-muted",
        isActive(pathname, "/inbox") && "bg-muted",
        className,
      )}
    >
      <BellIcon className="size-[22px]" />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

function UserMenu() {
  const { user, isLoading } = useSession();
  const signOut = useSignOut();
  if (isLoading) return <Skeleton className="h-12 w-full rounded-2xl" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-muted data-[popup-open]:bg-muted"
          />
        }
      >
        <UserAvatar src={user?.avatarUrl} name={user?.displayName ?? user?.handle} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user?.displayName ?? user?.handle ?? "You"}</span>
          <span className="block truncate text-xs text-muted-foreground">@{user?.handle ?? "pawfriend"}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56 rounded-2xl p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">{user?.email ?? "Signed in"}</DropdownMenuLabel>
          <DropdownMenuItem nativeButton={false} render={<Link href="/profile" />}>
            <UserRoundIcon /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem nativeButton={false} render={<Link href="/inbox" />}>
            <InboxIcon /> Inbox
          </DropdownMenuItem>
          <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
            <SettingsIcon /> Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ onCreate }: { onCreate: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <Link href="/home" className="px-2" aria-label="Pawtella home">
        <Logo size="md" />
      </Link>
      <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          if (item.href === "/create") {
            return (
              <button
                key={item.href}
                type="button"
                onClick={onCreate}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition",
                  active ? "bg-coral-soft text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <PlusIcon className="size-4" strokeWidth={3} />
                </span>
                {item.label}
              </button>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition",
                active ? "bg-coral-soft text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
            >
              <NavIcon item={item} active={active} className="size-[22px]" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/inbox"
          aria-current={isActive(pathname, "/inbox") ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition",
            isActive(pathname, "/inbox") ? "bg-coral-soft text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
          )}
        >
          <InboxBellInline />
          Inbox
        </Link>
      </nav>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-2xl bg-accent px-3 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Paw Points</span>
          <PointsPill size="sm" />
        </div>
        <UserMenu />
      </div>
    </aside>
  );
}

/** Nav icon; the Shop item carries the cart item count. */
function NavIcon({ item, active, className }: { item: NavItem; active: boolean; className: string }) {
  const cartCount = useCartCount();
  const badge = item.href === "/shop" ? cartCount : 0;
  return (
    <span className="relative inline-flex">
      <item.icon className={className} strokeWidth={active ? 2.4 : 2} />
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </span>
  );
}

function InboxBellInline() {
  const unread = useUnreadCount();
  return (
    <span className="relative inline-flex">
      <BellIcon className="size-[22px]" />
      {unread > 0 && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-sidebar" />}
    </span>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/home" aria-label="Pawtella home">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1.5">
          <PointsPill size="sm" />
          <InboxBell />
        </div>
      </div>
    </header>
  );
}

function MobileTabBar({ onCreate }: { onCreate: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 pb-safe backdrop-blur-md md:hidden"
    >
      <div className="grid h-16 grid-cols-5 items-end">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          if (item.href === "/create") {
            return (
              <div key={item.href} className="flex h-full items-start justify-center">
                <button
                  type="button"
                  onClick={onCreate}
                  aria-label="Create"
                  className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition active:scale-95"
                >
                  <PlusIcon className="size-7" strokeWidth={2.75} />
                </button>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <NavIcon item={item} active={active} className="size-6" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Responsive app chrome: bottom tabs + top bar under 768px, left sidebar at ≥768px. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar onCreate={() => setCreateOpen(true)} />
      <MobileTopBar />
      <main className="pb-24 md:pb-10 md:pl-64">
        <TermsAcceptanceBanner />
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-6 md:pt-10">{children}</div>
        <Footer className="mt-10 bg-transparent" />
      </main>
      <MobileTabBar onCreate={() => setCreateOpen(true)} />
      <CreateDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export { PawIcon };
