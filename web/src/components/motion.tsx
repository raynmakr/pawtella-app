"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client (hides before first paint → no flash), useEffect on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface RevealProps extends React.ComponentProps<"div"> {
  /** Seconds of delay once revealed — use for sibling stagger. */
  delay?: number;
  /** Starting vertical offset in px. */
  y?: number;
}

/**
 * Reveals its children with a gentle rise the first time they scroll into view.
 * Visible by default so it is safe without JS, and completely inert (always visible,
 * no transition) under prefers-reduced-motion.
 */
export function Reveal({ delay = 0, y = 12, className, style, children, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // "idle" = SSR / pre-JS (visible); "hidden" = armed; "shown" = revealed.
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // stay visible
    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const armed = state !== "idle";
  const hidden = state === "hidden";
  return (
    <div
      ref={ref}
      className={cn(armed && "transition-[opacity,transform] duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)]", className)}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${y}px)` : undefined,
        transitionDelay: state === "shown" && delay ? `${delay}s` : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface StaggerProps extends React.ComponentProps<"div"> {
  /** Per-item delay step in seconds. */
  step?: number;
  /** Cap the stagger so long lists never make the last item wait. */
  max?: number;
  y?: number;
}

/** Wraps each direct child in a {@link Reveal} with an incremental, capped delay. */
export function Stagger({ step = 0.06, max = 8, y = 12, className, children, ...props }: StaggerProps) {
  const items = Children.toArray(children);
  return (
    <div className={className} {...props}>
      {items.map((child, i) => (
        <Reveal key={i} delay={Math.min(i, max) * step} y={y}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
