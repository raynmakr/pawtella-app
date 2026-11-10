"use client";

import { useEffect } from "react";
import { useKeyboardStore } from "@/stores/keyboard";

/** A field whose focus raises the on-screen keyboard. */
function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color"].includes(type);
  }
  return false;
}

/**
 * Tracks the on-screen keyboard so the app chrome can react to it.
 *
 * Two signals are combined (see `useKeyboardOpen`):
 *   1. Focus of a text field on a touch device — the reliable signal on iOS Safari,
 *      which frequently shrinks `window.innerHeight` in lockstep with the visual
 *      viewport, hiding the keyboard from a height-delta check.
 *   2. The visualViewport geometry — used to size and pin the composer to the real
 *      visible area and (on Chrome Android) as a fallback keyboard detector.
 *
 * The visible height, offset and inset are also published as CSS variables
 * (`--viewport-height`, `--viewport-offset-top`, `--keyboard-inset`).
 */
export function KeyboardListener() {
  const set = useKeyboardStore((s) => s.set);
  const setFocused = useKeyboardStore((s) => s.setFocused);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    const update = () => {
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.style.setProperty("--viewport-height", `${vv.height}px`);
      root.style.setProperty("--viewport-offset-top", `${vv.offsetTop}px`);
      set({ inset, viewportHeight: vv.height, offsetTop: vv.offsetTop });
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    // Focus-based detection — only on touch devices, so desktop focus never
    // triggers the mobile keyboard layout.
    const isTouch =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      if (!isTouch) return;
      if (isTextField(e.target)) {
        if (blurTimer) clearTimeout(blurTimer);
        setFocused(true);
      }
    };
    const onFocusOut = () => {
      if (!isTouch) return;
      // Debounce: tapping Send briefly blurs the textarea before focus settles,
      // and moving between fields shouldn't flicker the layout.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        setFocused(isTextField(document.activeElement));
      }, 150);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, [set, setFocused]);

  // Lock the page while the keyboard is open so iOS can't scroll the layout
  // viewport out from under the pinned, fixed-position chat overlay.
  const open = useKeyboardStore((s) => s.focused || s.inset > 0);
  useEffect(() => {
    const root = document.documentElement;
    if (open) {
      root.classList.add("keyboard-open");
      root.style.setProperty("overflow", "hidden");
    } else {
      root.classList.remove("keyboard-open");
      root.style.removeProperty("overflow");
    }
    return () => {
      root.classList.remove("keyboard-open");
      root.style.removeProperty("overflow");
    };
  }, [open]);

  return null;
}
