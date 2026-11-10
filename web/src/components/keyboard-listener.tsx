"use client";

import { useEffect } from "react";
import { useKeyboardStore } from "@/stores/keyboard";

/**
 * Tracks the on-screen keyboard via the visualViewport API so app chrome can
 * react to it. iOS Safari does not shrink the layout viewport (or `dvh`) when
 * the keyboard opens, so we measure how much it overlaps and expose it as both
 * a store value and the `--keyboard-inset` / `--viewport-height` CSS variables.
 *
 * On browsers that honour `interactive-widget=resizes-content` (Chrome Android)
 * the layout already resizes, so the measured inset stays ~0 and this is a no-op.
 */
export function KeyboardListener() {
  const set = useKeyboardStore((s) => s.set);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.style.setProperty("--viewport-height", `${vv.height}px`);
      set({ inset, viewportHeight: vv.height });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [set]);

  return null;
}
