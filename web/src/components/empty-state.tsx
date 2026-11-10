import { cn } from "@/lib/utils";
import { Mascot, type PipPose } from "./mascot";

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ReactNode;
  /** Pip's pose when no custom icon is given. */
  pose?: PipPose;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, pose = "happy", title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-coral-soft text-primary [&_svg]:size-8">{icon}</div>
      ) : (
        <Mascot pose={pose} className="mb-1 w-24" />
      )}
      <h3 className="text-lg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
