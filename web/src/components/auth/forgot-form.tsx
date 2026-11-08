"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2Icon, MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "./form-field";
import { authService } from "@/services/auth";
import { errorMessage } from "@/lib/api";

const schema = z.object({ email: z.email("Enter a valid email") });
type Values = z.infer<typeof schema>;

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-teal-soft/60 p-6 text-center">
        <MailCheckIcon className="mb-3 size-8 text-secondary" />
        <p className="font-heading font-bold">Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">If an account exists for that email, a reset link is on its way. It&apos;s valid for one hour.</p>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await authService.forgot(email);
      setSent(true);
    } catch (err) {
      form.setError("root", { message: errorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...form.register("email")} />
      </FormField>
      {errors.root?.message && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{errors.root.message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        Send reset link
      </Button>
    </form>
  );
}
