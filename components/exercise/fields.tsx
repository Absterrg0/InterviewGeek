"use client";

import { useId } from "react";

export function WrittenField({
  label,
  value,
  onChange,
  min,
  placeholder,
  rows = 5,
  mono = false,
  hint,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  hint?: string;
  /** Can be left empty; a minimum only applies once something is written. */
  optional?: boolean;
}) {
  const id = useId();
  const length = value.trim().length;
  const short = length < min && !(optional && length === 0);
  return (
    <div>
      <label htmlFor={id} className="block text-[0.875rem] font-medium leading-snug mb-2">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-3">Optional</span>}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className={`field resize-y ${mono ? "field-mono" : "leading-relaxed"}`}
      />
      <p id={`${id}-hint`} className="mt-2 text-xs text-ink-3">
        {short ? `Write at least ${min} characters (${length} so far). ` : ""}
        {hint ??
          (optional
            ? "If you write down your reasoning, you can check it against the key points afterwards."
            : "Your own words. You will compare them against the reference afterwards.")}
      </p>
    </div>
  );
}

export function SubmitRow({ ready, label, reason }: { ready: boolean; label: string; reason?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 pt-2">
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {label}
      </button>
      {!ready && reason && <p className="text-sm text-ink-3">{reason}</p>}
    </div>
  );
}

export const LETTERS = "ABCDEFGHIJ";
