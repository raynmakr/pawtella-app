"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

interface FormFieldProps {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Label + control + error, wired for react-hook-form via `error`. */
export function FormField({ label, htmlFor, error, description, children, className }: FormFieldProps) {
  return (
    <Field data-invalid={!!error || undefined} className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
