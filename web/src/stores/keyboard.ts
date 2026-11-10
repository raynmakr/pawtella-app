"use client";

import { create } from "zustand";

interface KeyboardState {
  /** Pixels of the layout viewport currently covered by the on-screen keyboard (0 when closed). */
  inset: number;
  /** Current visible height from `window.visualViewport` (the area above the keyboard). */
  viewportHeight: number;
  set: (next: { inset: number; viewportHeight: number }) => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  inset: 0,
  viewportHeight: 0,
  set: (next) =>
    set((s) => (s.inset === next.inset && s.viewportHeight === next.viewportHeight ? s : next)),
}));

/** True while the on-screen keyboard is open (mobile only). */
export function useKeyboardOpen() {
  return useKeyboardStore((s) => s.inset > 0);
}
