"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api";

interface ErrorStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  title?: React.ReactNode;
  error?: unknown;
  description?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ title = "Something went wrong", error, description, onRetry, retrying, className, ...props }: ErrorStateProps) {
  const detail = description ?? (error ? errorMessage(error) : "We couldn't load this right now.");
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center rounded-card border border-destructive/20 bg-destructive/5 px-6 py-12 text-center", className)}
      {...props}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="size-7" />
      </div>
      <h3 className="text-lg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{detail}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry} disabled={retrying}>
          <RotateCcwIcon data-icon="inline-start" className={cn(retrying && "animate-spin")} />
          Try again
        </Button>
      )}
    </div>
  );
}
