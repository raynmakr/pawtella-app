import { cn } from "@/lib/utils";

/** Centers content with the 1100px max width and the responsive side gutter. */
export function Container({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "narrow" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        size === "default" && "max-w-[1100px]",
        size === "narrow" && "max-w-xl",
        size === "wide" && "max-w-[1400px]",
        className,
      )}
      {...props}
    />
  );
}
