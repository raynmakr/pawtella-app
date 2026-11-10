"use client";

import { create } from "zustand";

export const FEED_MUTED_KEY = "pawtella_feed_muted";

/** Read the persisted mute preference. Defaults to muted (true) — including SSR and private mode. */
export function readMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FEED_MUTED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(FEED_MUTED_KEY, muted ? "1" : "0");
  } catch {
    // private mode; keep it in memory only
  }
}

interface VideoPrefState {
  /** Session-wide feed sound preference. Starts muted; flips when the user mutes/unmutes any video. */
  muted: boolean;
  /**
   * Whether a user gesture has happened this session, so the browser will allow unmuted playback.
   * Not persisted: autoplay policies reset every page load and require a fresh gesture.
   */
  soundUnlocked: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setMuted: (muted: boolean) => void;
  markSoundUnlocked: () => void;
}

let gestureInstalled = false;
/** Install a one-shot listener so the first user gesture of the session unlocks unmuted playback. */
function installGestureUnlock(onGesture: () => void) {
  if (gestureInstalled || typeof window === "undefined") return;
  gestureInstalled = true;
  const handler = () => {
    onGesture();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("touchend", handler);
  };
  window.addEventListener("pointerdown", handler, { passive: true });
  window.addEventListener("keydown", handler);
  window.addEventListener("touchend", handler, { passive: true });
}

export const useVideoPrefStore = create<VideoPrefState>((set, get) => ({
  muted: true,
  soundUnlocked: false,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ muted: readMuted(), hydrated: true });
    installGestureUnlock(() => get().markSoundUnlocked());
  },
  setMuted: (muted) => {
    writeMuted(muted);
    // Toggling sound is itself a user gesture, so unmuted playback is unlocked from here on.
    set({ muted, hydrated: true, soundUnlocked: true });
  },
  markSoundUnlocked: () => {
    if (!get().soundUnlocked) set({ soundUnlocked: true });
  },
}));
