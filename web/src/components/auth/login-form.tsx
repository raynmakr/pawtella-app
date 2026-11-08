"use client";

import Link from "next/link";
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

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const { hydrate, refresh } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authService.login(values);
      hydrate({ user: res.user, pets: [] });
      const session = await refresh();
      toast.success(`Welcome back${res.user.displayName ? `, ${res.user.displayName}` : ""}!`);
      router.push(session.pets.length === 0 ? "/onboarding/add-pet" : "/home");
      router.refresh();
    } catch (err) {
      form.setError("root", { message: errorMessage(err, "Could not sign in") });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...form.register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" aria-invalid={!!errors.password} {...form.register("password")} />
      </FormField>
      {errors.root?.message && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        Sign in
      </Button>
      <Link href="/forgot" className="text-center text-sm font-medium text-muted-foreground hover:text-primary">
        Forgot your password?
      </Link>
    </form>
  );
}
