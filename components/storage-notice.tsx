"use client";

import { dismissRecovery, useStoreStatus } from "@/lib/store/learner-store";

/** Tells the learner when their progress is not being saved, or was unreadable. */
export function StorageNotice() {
  const status = useStoreStatus();
  if (!status) return null;
  const messages: { key: string; text: string; dismiss?: () => void }[] = [];
  if (!status.persistent) {
    messages.push({
      key: "persistent",
      text: "This browser is blocking local storage, so progress will be lost when you close the tab.",
    });
  }
  if (status.saveFailed) {
    messages.push({
      key: "save",
      text: "Your last answer could not be saved: browser storage is full. Export your data from Understanding to keep it.",
    });
  }
  if (status.recovered) {
    messages.push({
      key: "recovered",
      text: `Saved progress in this browser could not be read, so you are starting fresh. The original data was kept under the storage key "${status.recovered.quarantineKey}".`,
      dismiss: dismissRecovery,
    });
  }
  if (messages.length === 0) return null;
  return (
    <div role="status" className="shell pt-4">
      <div className="rounded-xl bg-signal-partial-soft">
        {messages.map((m) => (
          <div key={m.key} className="flex items-start justify-between gap-4 px-4 py-2.5 text-[0.8125rem] text-ink">
            <p className="flex gap-3">
              <span className="led led-partial mt-1.5 size-1.5" aria-hidden="true" />
              {m.text}
            </p>
            {m.dismiss && (
              <button type="button" className="btn btn-secondary min-h-0 shrink-0 px-2.5 py-1 text-[0.75rem]" onClick={m.dismiss}>
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
