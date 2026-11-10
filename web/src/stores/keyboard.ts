"use client";

import { create } from "zustand";

interface KeyboardState {
  /** Pixels of the layout viewport currently covered by the on-screen keyboard (0 when closed). */
  inset: number;
  /** Current visible height from `window.visualViewport` (the area above the keyboard). */
  viewportHeight: number;
  /** `window.visualViewport.offsetTop` — how far the layout viewport is scrolled under the visible area. */
  offsetTop: number;
  /** `window.innerHeight` at last measure — the full layout viewport height. */
  innerHeight: number;
  /**
   * Distance (px) from the bottom of the window to where the composer's bottom edge should
   * sit: the keyboard inset plus, on iOS, an allowance for the iOS 26 floating accessory bar
   * that hovers above the keyboard and would otherwise cover the composer.
   */
  bottomInset: number;
  /** A text field (textarea/input/contenteditable) is focused on a touch device. */
  focused: boolean;
  set: (next: {
    inset: number;
    viewportHeight: number;
    offsetTop: number;
    innerHeight: number;
    bottomInset: number;
  }) => void;
  setFocused: (focused: boolean) => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  inset: 0,
  viewportHeight: 0,
  offsetTop: 0,
  innerHeight: 0,
  bottomInset: 0,
  focused: false,
  set: (next) =>
    set((s) =>
      s.inset === next.inset &&
      s.viewportHeight === next.viewportHeight &&
      s.offsetTop === next.offsetTop &&
      s.innerHeight === next.innerHeight &&
      s.bottomInset === next.bottomInset
        ? s
        : { ...s, ...next },
    ),
  setFocused: (focused) => set((s) => (s.focused === focused ? s : { ...s, focused })),
}));

/**
 * True while the on-screen keyboard is (almost certainly) open on a touch device.
 *
 * iOS Safari is unreliable about the visualViewport height delta — `window.innerHeight`
 * often shrinks in lockstep with `visualViewport.height`, leaving the measured inset at
 * ~0 even with the keyboard up. So focusing a text field on a touch device is treated as
 * the primary signal, with the measured inset as a secondary one.
 */
export function useKeyboardOpen() {
  return useKeyboardStore((s) => s.focused || s.inset > 0);
}
