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

/** iOS/iPadOS Safari — the only platform with the floating accessory bar above the keyboard. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * iOS 26 Safari floats a form accessory bar (key / card / location icons plus the
 * round keyboard-dismiss button) ABOVE the keyboard. visualViewport.height counts the
 * strip behind that bar as visible, so a composer pinned to the visual viewport's
 * bottom ends up half-covered. We lift it by this much (plus the safe-area inset).
 */
const IOS_ACCESSORY_BAR = 56;

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
 * The visible geometry is also published as CSS variables (`--viewport-height`,
 * `--viewport-offset-top`, `--keyboard-inset`, `--composer-bottom-inset`). The last
 * is the distance from the window bottom to where the composer's bottom edge should
 * sit, including the iOS accessory-bar allowance.
 */
export function KeyboardListener() {
  const set = useKeyboardStore((s) => s.set);
  const setFocused = useKeyboardStore((s) => s.setFocused);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const ios = isIOS();

    const update = () => {
      if (!vv) return;
      const innerHeight = window.innerHeight;
      const inset = Math.max(0, innerHeight - vv.height - vv.offsetTop);
      // Keyboard open if a field is focused (iOS, where inset often reads ~0) or the
      // viewport actually shrank (Chrome Android).
      const kbOpen = useKeyboardStore.getState().focused || inset > 0;
      const accessory = ios && kbOpen ? IOS_ACCESSORY_BAR : 0;
      const bottomInset = inset + accessory;

      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.style.setProperty("--viewport-height", `${vv.height}px`);
      root.style.setProperty("--viewport-offset-top", `${vv.offsetTop}px`);
      // Add the safe-area inset in CSS so it resolves live even if it changes.
      root.style.setProperty(
        "--composer-bottom-inset",
        accessory > 0 ? `calc(${bottomInset}px + env(safe-area-inset-bottom))` : `${bottomInset}px`,
      );

      set({ inset, viewportHeight: vv.height, offsetTop: vv.offsetTop, innerHeight, bottomInset });
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    // Focus-based detection — only on touch devices, so desktop focus never
    // triggers the mobile keyboard layout.
    const isTouch =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      if (!isTouch) return;
      if (isTextField(e.target)) {
        if (blurTimer) clearTimeout(blurTimer);
        setFocused(true);
        update();
        // iOS doesn't move the page under a fixed overlay, but belt-and-braces: keep the
        // layout viewport pinned to the top so nothing slides under the keyboard.
        window.scrollTo(0, 0);
        // iOS animates the keyboard (and resizes the visual viewport) over ~300ms, so the
        // first measurement is stale. Re-measure once it settles.
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          update();
          window.scrollTo(0, 0);
        }, 300);
      }
    };
    const onFocusOut = () => {
      if (!isTouch) return;
      // Debounce: tapping Send briefly blurs the textarea before focus settles,
      // and moving between fields shouldn't flicker the layout.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        setFocused(isTextField(document.activeElement));
        update();
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
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [set, setFocused]);

  // Lock the page while the keyboard is open so iOS can't scroll the layout
  // viewport out from under the pinned, fixed-position chat overlay.
  const open = useKeyboardStore((s) => s.focused || s.inset > 0);
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (open) {
      root.classList.add("keyboard-open");
      root.style.setProperty("overflow", "hidden");
      body.style.setProperty("overflow", "hidden");
      // Pin the body so iOS treats the layout viewport as unscrollable.
      body.style.setProperty("position", "fixed");
      body.style.setProperty("inset", "0");
      window.scrollTo(0, 0);
    } else {
      root.classList.remove("keyboard-open");
      root.style.removeProperty("overflow");
      body.style.removeProperty("overflow");
      body.style.removeProperty("position");
      body.style.removeProperty("inset");
    }
    return () => {
      root.classList.remove("keyboard-open");
      root.style.removeProperty("overflow");
      body.style.removeProperty("overflow");
      body.style.removeProperty("position");
      body.style.removeProperty("inset");
    };
  }, [open]);

  return null;
}
