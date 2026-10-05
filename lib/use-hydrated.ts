"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and through the hydration render, true afterwards.
 * Use it to render a server-safe version of browser-only state, so the page
 * paints immediately and only the parts that truly need the browser settle in
 * after hydration (which also keeps hydration from mismatching).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
