"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "./form-field";
import { authService } from "@/services/auth";
import { useSession } from "@/stores/session";
import { errorMessage } from "@/lib/api";
import { clearReferralCode, readReferralCode } from "@/lib/referral";

const schema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you").max(60, "That's a long name"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  referralCode: z.string().trim().max(32).optional(),
});
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const { hydrate } = useSession();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", password: "", referralCode: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    const code = readReferralCode();
    if (code) form.setValue("referralCode", code);
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authService.register({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        referralCode: values.referralCode ? values.referralCode.toUpperCase() : undefined,
      });
      clearReferralCode();
      hydrate({ user: res.user, pets: [] });
      toast.success("Welcome to Pawtella!");
      router.push("/onboarding/add-pet");
      router.refresh();
    } catch (err) {
      form.setError("root", { message: errorMessage(err, "Could not create your account") });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField label="Your name" htmlFor="displayName" error={errors.displayName?.message}>
        <Input id="displayName" autoComplete="name" placeholder="Sam" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
      </FormField>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...form.register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message} description="At least 8 characters.">
        <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" aria-invalid={!!errors.password} {...form.register("password")} />
      </FormField>
      <FormField label="Referral or partner code" htmlFor="referralCode" error={errors.referralCode?.message} description="Optional. Both of you earn bonus Paw Points.">
        <Input id="referralCode" autoComplete="off" placeholder="PAW-1234" className="uppercase placeholder:normal-case" {...form.register("referralCode")} />
      </FormField>
      {errors.root?.message && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
