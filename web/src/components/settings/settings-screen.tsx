"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { BrainIcon, CameraIcon, ChevronRightIcon, Loader2Icon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/avatars";
import { FormField } from "@/components/auth/form-field";
import { useSession, useSessionStore } from "@/stores/session";
import { usersService } from "@/services/users";
import { authService } from "@/services/auth";
import { uploadFile } from "@/services/upload";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name").max(60),
  bio: z.string().trim().max(300, "Keep it under 300 characters").optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border sm:p-6">
      <h2 className="text-lg">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} disabled={disabled} />
    </label>
  );
}

const THEMES = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <Skeleton className="h-12 w-full rounded-2xl" />;
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1.5">
      {THEMES.map(({ value, label, Icon }) => {
        const selected = (theme ?? "system") === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition",
              selected ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, isLoading, clear } = useSession();
  const setUser = useSessionStore((st) => st.setUser);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: user ? { displayName: user.displayName ?? "", bio: user.bio ?? "" } : undefined,
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const saveProfile = form.handleSubmit(async (values) => {
    try {
      const res = await usersService.updateMe({ displayName: values.displayName, bio: values.bio || null });
      setUser(res.user);
      form.reset({ displayName: res.user.displayName ?? "", bio: res.user.bio ?? "" });
      toast.success(res.bonusAwarded ? "Saved! Profile bonus unlocked." : "Profile saved");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const asset = await uploadFile(file, { kind: "image", folder: "avatars" });
      const res = await usersService.updateMe({ avatarUrl: asset.secureUrl || asset.url });
      setUser(res.user);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(errorMessage(err, "Could not upload that photo"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const patchFlag = async (patch: { marketingOptIn?: boolean; featureConsentDefault?: boolean }) => {
    if (!user) return;
    const prev = user;
    setUser({ ...user, ...patch });
    try {
      const res = await usersService.updateMe(patch);
      setUser(res.user);
    } catch (err) {
      setUser(prev);
      toast.error(errorMessage(err));
    }
  };

  const signOut = async () => {
    try {
      await authService.logout();
    } catch {
      /* local */
    }
    clear();
    qc.clear();
    router.push("/welcome");
    router.refresh();
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount();
      clear();
      qc.clear();
      toast.success("Your account has been deleted.");
      router.push("/welcome");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, appearance and privacy." />
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div className="flex flex-col gap-5">
          <Section title="Profile" description="How you appear to other pet people.">
            {isLoading || !user ? (
              <div className="space-y-4">
                <Skeleton className="size-20 rounded-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <form onSubmit={saveProfile} noValidate className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="group relative rounded-full"
                    aria-label="Change profile photo"
                    disabled={avatarBusy}
                  >
                    <UserAvatar src={user.avatarUrl} name={user.displayName ?? user.handle} size="xl" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                      {avatarBusy ? <Loader2Icon className="size-6 animate-spin" /> : <CameraIcon className="size-6" />}
                    </span>
                  </button>
                  <div>
                    <p className="font-heading font-bold">@{user.handle}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={avatarBusy}>
                      {avatarBusy ? "Uploading…" : "Change photo"}
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onAvatar} />
                  </div>
                </div>
                <FormField label="Display name" htmlFor="displayName" error={errors.displayName?.message}>
                  <Input id="displayName" autoComplete="name" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
                </FormField>
                <FormField label="Bio" htmlFor="bio" error={errors.bio?.message} description="A line or two about you and your crew.">
                  <Textarea id="bio" rows={3} placeholder="Dog dad to two very loud beagles." {...form.register("bio")} />
                </FormField>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                    Save changes
                  </Button>
                </div>
              </form>
            )}
          </Section>

          <Section title="Privacy and emails">
            <div className="divide-y divide-border">
              <ToggleRow
                label="Feature my posts"
                description="Default consent to let Pawtella feature your public posts in the app and on social."
                checked={!!user?.featureConsentDefault}
                onChange={(v) => void patchFlag({ featureConsentDefault: v })}
                disabled={!user}
              />
              <ToggleRow
                label="Tips and offers by email"
                description="Occasional emails about new features, challenges and shop deals."
                checked={!!user?.marketingOptIn}
                onChange={(v) => void patchFlag({ marketingOptIn: v })}
                disabled={!user}
              />
              <Link
                href="/settings/ai-memory"
                className="flex items-center justify-between gap-4 py-3 last:pb-0 transition hover:text-primary"
              >
                <span className="flex items-start gap-3">
                  <BrainIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-[15px] font-semibold">What Pawtella AI remembers</span>
                    <span className="block text-sm text-muted-foreground">Review, edit or delete what the assistant remembers, or turn memory off.</span>
                  </span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section title="Appearance" description="Follows your device by default.">
            <ThemeToggle />
          </Section>

          <Section title="Account">
            <div className="flex flex-col gap-3">
              <Button variant="outline" className="w-full justify-start" onClick={() => void signOut()}>
                <LogOutIcon data-icon="inline-start" /> Sign out
              </Button>
              <Button variant="destructive" className="w-full justify-start" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon data-icon="inline-start" /> Delete account
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Deleting removes your profile, pets and sign-in. Posts are hidden. Paw Points are forfeited.
              </p>
            </div>
          </Section>

          <Section title="Legal">
            <div className="flex flex-col gap-3">
              <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
                <span className="inline-flex items-center gap-2">
                  <Link href="/terms" className="text-foreground/80 hover:text-primary hover:underline">
                    Terms of Use
                  </Link>
                  <Link
                    href="/fr/terms"
                    hrefLang="fr-CA"
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    Français
                  </Link>
                </span>
                <span className="inline-flex items-center gap-2">
                  <Link href="/privacy" className="text-foreground/80 hover:text-primary hover:underline">
                    Privacy Policy
                  </Link>
                  <Link
                    href="/fr/privacy"
                    hrefLang="fr-CA"
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    Français
                  </Link>
                </span>
              </nav>
              <p className="text-xs leading-relaxed text-muted-foreground">
                © 2026 Bone &amp; Biscuit College West (operating as Pawtella) · Toronto, Canada
              </p>
            </div>
          </Section>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="rounded-card">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Your profile, pets and {user?.pawPoints ?? 0} Paw Points will be gone for good.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep my account
            </Button>
            <Button variant="destructive" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteAccount()} disabled={deleting}>
              {deleting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

