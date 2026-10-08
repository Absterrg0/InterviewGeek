"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, MINUTE);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      // The next subscriber reads a fresh time instead of one from when the page was last open.
      now = 0;
    }
  };
}

function snapshot() {
  if (now === 0) now = Date.now();
  return now;
}

/**
 * The current time, refreshed every minute; null on the server and during
 * hydration, so time-dependent UI (what is due for review) never mismatches.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
