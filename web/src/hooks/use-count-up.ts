"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a displayed integer toward `value` whenever it changes (ease-out cubic).
 * Snaps instantly under prefers-reduced-motion. Used for the Paw Points balance so the
 * reward reads as it lands.
 */
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = reduce ? 1 : Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return display;
}
