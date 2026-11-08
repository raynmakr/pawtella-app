"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, ClockIcon, HandshakeIcon, Loader2Icon, LocateFixedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/auth/form-field";
import { usePartnerMe } from "@/hooks/use-partners";
import { partnersService } from "@/services/partners";
import { useSession } from "@/stores/session";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { PARTNER_TYPES, isDashboard, type PartnerType } from "@/types/partner";

const schema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(80),
  type: z.enum(["vet", "groomer", "walker", "trainer", "sitter", "boarding", "rescue", "boutique", "other"], { message: "Pick a type" }),
  description: z.string().trim().max(2000).optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(500).optional(),
  bookingUrl: z.string().trim().max(500).optional(),
  instagram: z.string().trim().max(60).optional(),
  street1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  services: z.string().trim().max(600).optional(),
});
type Values = z.infer<typeof schema>;

export function PartnerApply() {
  const me = usePartnerMe();
  const { user } = useSession();
  const qc = useQueryClient();
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState<{ businessName: string; code: string } | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: "", type: undefined as unknown as PartnerType, email: user?.email ?? "", city: "Toronto", province: "ON" },
  });
  const { errors, isSubmitting } = form.formState;
  const typeValue = useWatch({ control: form.control, name: "type" });

  const locate = () => {
    if (!("geolocation" in navigator)) return toast.error("Location isn't available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocating(false);
        toast.success("Location pinned");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location");
      },
      { timeout: 10_000 },
    );
  };

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const res = await partnersService.apply({
        businessName: v.businessName,
        type: v.type,
        description: v.description || undefined,
        email: v.email || undefined,
        phone: v.phone || undefined,
        website: v.website || undefined,
        bookingUrl: v.bookingUrl || undefined,
        instagram: v.instagram || undefined,
        street1: v.street1 || undefined,
        city: v.city || undefined,
        province: v.province || undefined,
        postalCode: v.postalCode || undefined,
        country: "CA",
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        services: v.services ? v.services.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [],
      });
      void qc.invalidateQueries({ queryKey: queryKeys.partners.me });
      setSubmitted({ businessName: res.partner.businessName, code: res.partner.code });
    } catch (err) {
      form.setError("root", { message: errorMessage(err, "Couldn't send your application") });
    }
  });

  if (me.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    );
  }

  if (submitted || (me.data && !isDashboard(me.data))) {
    const name = submitted?.businessName ?? me.data?.partner.businessName ?? "your business";
    const status = submitted ? "pending" : (me.data && !isDashboard(me.data) ? me.data.status : "pending");
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <EmptyState
          icon={status === "rejected" ? <ClockIcon /> : <CheckCircle2Icon />}
          title={status === "rejected" ? "Application not approved" : status === "suspended" ? "Partner account paused" : `Thanks, ${name}!`}
          description={
            status === "rejected"
              ? "We couldn't approve this application. Reply to our email if you think that's a mistake."
              : status === "suspended"
                ? "Your partner account is paused. Reach out to support and we'll sort it out."
                : "Your application is in review. We check every business by hand, usually within 2 business days, and email you when you're approved. Then you'll get your QR poster, referral code and a supplies discount."
          }
          action={
            <Button nativeButton={false} render={<Link href="/profile" />}>
              Back to profile
            </Button>
          }
          className="bg-card"
        />
      </div>
    );
  }

  if (me.data && isDashboard(me.data)) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <EmptyState
          icon={<HandshakeIcon />}
          title="You're already a partner"
          description="Head to your dashboard for your code, poster and earnings."
          action={
            <Button nativeButton={false} render={<Link href="/partner/dashboard" />}>
              Open dashboard
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageHeader
        eyebrow="Partner program"
        title="Become a Pawtella partner"
        description="For vets, groomers, walkers, trainers, sitters, rescues and boutiques. Earn 10% on every order your clients place, get 10–20% off supplies, and a spot in our directory."
      />

      <section className="grid gap-5 rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-6">
        <h2 className="text-lg">Your business</h2>
        <FormField label="Business name" htmlFor="pa-name" error={errors.businessName?.message}>
          <Input id="pa-name" placeholder="Happy Paws Grooming" {...form.register("businessName")} aria-invalid={!!errors.businessName} />
        </FormField>
        <FormField label="Type" htmlFor="pa-type" error={errors.type?.message}>
          <Select value={typeValue ?? null} onValueChange={(v) => form.setValue("type", v as PartnerType, { shouldValidate: true })}>
            <SelectTrigger id="pa-type" className="w-full" aria-invalid={!!errors.type}>
              <SelectValue placeholder="Choose a type" />
            </SelectTrigger>
            <SelectContent>
              {PARTNER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Description" htmlFor="pa-desc" error={errors.description?.message} description="Shown on your directory listing.">
          <Textarea id="pa-desc" rows={3} placeholder="What you do, who you serve, what makes you great" {...form.register("description")} />
        </FormField>
        <FormField label="Services" htmlFor="pa-services" error={errors.services?.message} description="Comma-separated, e.g. Full groom, Nail trim, De-shedding">
          <Input id="pa-services" placeholder="Full groom, Nail trim" {...form.register("services")} />
        </FormField>
      </section>

      <section className="grid gap-5 rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-6">
        <h2 className="text-lg">Contact</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Email" htmlFor="pa-email" error={errors.email?.message}>
            <Input id="pa-email" type="email" autoComplete="email" {...form.register("email")} />
          </FormField>
          <FormField label="Phone" htmlFor="pa-phone" error={errors.phone?.message}>
            <Input id="pa-phone" type="tel" autoComplete="tel" placeholder="416 555 0123" {...form.register("phone")} />
          </FormField>
          <FormField label="Website" htmlFor="pa-web" error={errors.website?.message}>
            <Input id="pa-web" inputMode="url" placeholder="happypaws.ca" {...form.register("website")} />
          </FormField>
          <FormField label="Booking link" htmlFor="pa-book" error={errors.bookingUrl?.message}>
            <Input id="pa-book" inputMode="url" placeholder="calendly.com/happypaws" {...form.register("bookingUrl")} />
          </FormField>
          <FormField label="Instagram" htmlFor="pa-ig" error={errors.instagram?.message}>
            <Input id="pa-ig" placeholder="@happypaws" {...form.register("instagram")} />
          </FormField>
        </div>
      </section>

      <section className="grid gap-5 rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">Address</h2>
            <p className="text-sm text-muted-foreground">So pet parents nearby can find you.</p>
          </div>
          <Button type="button" variant={geo ? "secondary" : "outline"} size="sm" onClick={locate} disabled={locating}>
            {locating ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <LocateFixedIcon data-icon="inline-start" />}
            {geo ? "Pinned" : "Pin my location"}
          </Button>
        </div>
        <FormField label="Street" htmlFor="pa-street" error={errors.street1?.message}>
          <Input id="pa-street" autoComplete="street-address" placeholder="123 Queen St W" {...form.register("street1")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="City" htmlFor="pa-city" error={errors.city?.message}>
            <Input id="pa-city" autoComplete="address-level2" {...form.register("city")} />
          </FormField>
          <FormField label="Province" htmlFor="pa-prov" error={errors.province?.message}>
            <Input id="pa-prov" autoComplete="address-level1" {...form.register("province")} />
          </FormField>
          <FormField label="Postal code" htmlFor="pa-postal" error={errors.postalCode?.message}>
            <Input id="pa-postal" autoComplete="postal-code" placeholder="M5V 2A8" {...form.register("postalCode")} />
          </FormField>
        </div>
      </section>

      {errors.root && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">We review every application by hand. You&apos;ll hear from us within 2 business days.</p>
        <Button type="submit" size="lg" disabled={isSubmitting} className="shrink-0">
          {isSubmitting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <HandshakeIcon data-icon="inline-start" />}
          Send application
        </Button>
      </div>
    </form>
  );
}
