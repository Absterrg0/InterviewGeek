"use client";

import { useSyncExternalStore } from "react";
import { clearDraft, draftSnapshot, subscribeDraft, writeDraft } from "@/lib/store/learner-store";

const serverSnapshot = () => undefined;

/**
 * Local state that survives navigation and reloads until submitted.
 *
 * The draft lives in the store, not in component state: reading it is a
 * snapshot (nothing on the server, the stored value in the browser), and
 * writing it notifies every reader. The `parse` function decides what counts
 * as a usable draft; anything it rejects falls back to `initial`.
 */
export function useDraft<T>(key: string, parse: (raw: unknown) => T | undefined, initial: () => T) {
  const raw = useSyncExternalStore(
    (listener) => subscribeDraft(key, listener),
    () => draftSnapshot(key),
    serverSnapshot,
  );
  const value = parse(raw) ?? initial();
  return [value, (next: T) => writeDraft(key, next), () => clearDraft(key)] as const;
}
