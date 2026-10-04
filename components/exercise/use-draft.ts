"use client";

import { useState } from "react";
import type { z } from "zod";
import { clearDraft, readDraft, writeDraft } from "@/lib/store/learner-store";

/**
 * Local state that survives navigation and reloads until submitted. Only
 * mount this inside client-only subtrees (after the learner store has
 * hydrated): the initializer reads browser storage.
 */
export function useDraft<T>(key: string, schema: z.ZodType<T>, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    const stored = schema.safeParse(readDraft(key));
    return stored.success ? stored.data : initial();
  });
  const update = (next: T) => {
    setValue(next);
    writeDraft(key, next);
  };
  const discard = () => clearDraft(key);
  return [value, update, discard] as const;
}
