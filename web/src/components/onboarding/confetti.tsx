"use client";

import { useMemo } from "react";

const COLORS = ["var(--primary)", "var(--secondary)", "var(--points)", "var(--success)", "#FFD6CC", "#B8E8E7"];

/** CSS-only confetti burst; no dependencies. */
export function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const seed = (i * 9301 + 49297) % 233280;
        const r = seed / 233280;
        return {
          left: `${(i / count) * 100 + (r - 0.5) * 6}%`,
          color: COLORS[i % COLORS.length],
          drift: `${(r - 0.5) * 120}px`,
          spin: `${360 + r * 720}deg`,
          dur: `${2 + r * 1.4}s`,
          delay: `${r * 1.2}s`,
          scale: 0.7 + r * 0.8,
        };
      }),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[400px] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: p.left,
              background: p.color,
              transform: `scale(${p.scale})`,
              "--drift": p.drift,
              "--spin": p.spin,
              "--dur": p.dur,
              "--delay": p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
