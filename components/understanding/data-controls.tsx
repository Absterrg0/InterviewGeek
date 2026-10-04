"use client";

import { useRef, useState } from "react";
import { exportState, importState, resetState } from "@/lib/store/learner-store";

/** Export, import and reset. Progress lives in this browser, so these are the backup story. */
export function DataControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const download = () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interviewgeek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "Exported. Keep the file somewhere safe; it contains all your answers." });
  };

  const upload = async (file: File) => {
    const result = importState(await file.text());
    setMessage(
      result.ok
        ? { tone: "ok", text: `Imported ${result.state.attempts.length} answers and ${result.state.projects.length} projects.` }
        : { tone: "error", text: `That file could not be imported. ${result.error.split("\n")[0]}` },
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Everything you answer is stored in this browser&apos;s local storage, with no account and no server. Export a
        copy to move it to another browser or keep a backup. Importing replaces what is here.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={download}>
          Export my data
        </button>
        <label className="btn btn-secondary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          Import from file
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        {confirming ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">Delete every answer and project?</span>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                resetState();
                setConfirming(false);
                setMessage({ tone: "ok", text: "All progress in this browser was deleted." });
              }}
            >
              Yes, delete everything
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost text-signal-gap" onClick={() => setConfirming(true)}>
            Reset progress
          </button>
        )}
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-signal-strong" : "text-signal-gap"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
