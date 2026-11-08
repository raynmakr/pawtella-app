"use client";

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

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Values = z.infer<typeof schema>;

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const { hydrate, refresh } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      const res = await authService.reset(token, password);
      hydrate({ user: res.user, pets: [] });
      await refresh();
      toast.success("Password updated. You're signed in.");
      router.push("/home");
      router.refresh();
    } catch (err) {
      form.setError("root", { message: errorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField label="New password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} disabled={!token} {...form.register("password")} />
      </FormField>
      <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} disabled={!token} {...form.register("confirm")} />
      </FormField>
      {errors.root?.message && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{errors.root.message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !token}>
        {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        Update password
      </Button>
    </form>
  );
}
