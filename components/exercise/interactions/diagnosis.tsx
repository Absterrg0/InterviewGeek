"use client";

import { InlineText } from "@/components/prose-core";
import { z } from "zod";
import type { InteractionOf } from "@/lib/domain/content";
import type { ResponseOf } from "@/lib/domain/learner";
import { SubmitRow, WrittenField } from "../fields";
import { MIN_RATIONALE, type InputProps } from "../types";
import { useDraft } from "../use-draft";

type Diagnosis = InteractionOf<"diagnosis">;

const draftSchema = z.object({ selected: z.array(z.number().int().nonnegative()), rationale: z.string() });

const ARTIFACT_NAME = { code: "Code", timeline: "Timeline", log: "Log" } as const;

export function DiagnosisInput({ interaction, draftKey, onSubmit }: InputProps<Diagnosis, ResponseOf<"diagnosis">>) {
  const [draft, setDraft, discard] = useDraft(draftKey, draftSchema, () => ({ selected: [], rationale: "" }));
  const lineCount = interaction.artifact.lines.length;
  const selected = draft.selected.filter((i) => i < lineCount);
  const ready = selected.length > 0 && draft.rationale.trim().length >= MIN_RATIONALE;

  const toggle = (index: number) => {
    const next = selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index].sort((a, b) => a - b);
    setDraft({ ...draft, selected: next });
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        discard();
        onSubmit({ kind: "diagnosis", selected, rationale: draft.rationale.trim() });
      }}
    >
      <div>
        <p className="font-medium text-[1.0625rem] leading-snug">{interaction.prompt}</p>
        <p className="mt-1 text-sm text-ink-2">Select every line that points to a flaw. Select a line again to clear it.</p>
      </div>
      <Artifact interaction={interaction}>
        {(line, index) => {
          const on = selected.includes(index);
          return (
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggle(index)}
              className={`group flex w-full text-left gap-3 px-3 py-1 transition-colors ${
                on ? "bg-signal-gap-soft" : "hover:bg-raised"
              }`}
            >
              <LineNumber index={index} marked={on} />
              <span className="whitespace-pre-wrap break-words min-w-0 flex-1">{line.text || " "}</span>
            </button>
          );
        }}
      </Artifact>
      <WrittenField
        label={interaction.rationale.prompt}
        value={draft.rationale}
        onChange={(rationale) => setDraft({ ...draft, rationale })}
        min={MIN_RATIONALE}
      />
      <SubmitRow
        ready={ready}
        label="Submit diagnosis"
        reason={selected.length === 0 ? "Select at least one line." : undefined}
      />
    </form>
  );
}

export function DiagnosisFeedback({ interaction, response }: { interaction: Diagnosis; response: ResponseOf<"diagnosis"> }) {
  const selected = new Set(response.selected);
  return (
    <div className="space-y-4">
      <p className="font-medium text-[1.0625rem] leading-snug">{interaction.prompt}</p>
      <Artifact interaction={interaction}>
        {(line, index) => {
          const mine = selected.has(index);
          const fault = line.fault;
          const status = fault ? (mine ? "found" : "missed") : mine ? "not-a-fault" : null;
          return (
            <div
              className={`px-3 py-1 ${
                status === "found"
                  ? "bg-signal-strong-soft"
                  : status === "missed"
                    ? "bg-signal-gap-soft"
                    : status === "not-a-fault"
                      ? "bg-sunken"
                      : ""
              }`}
            >
              <div className="flex gap-3">
                <LineNumber index={index} marked={mine} />
                <span className="whitespace-pre-wrap break-words min-w-0 flex-1">{line.text || " "}</span>
                {status && (
                  <span
                    className={`shrink-0 font-sans text-xs pt-0.5 ${
                      status === "found" ? "text-signal-strong" : status === "missed" ? "text-signal-gap" : "text-ink-3"
                    }`}
                  >
                    {status === "found" ? "found" : status === "missed" ? "missed" : "not the flaw"}
                  </span>
                )}
              </div>
              {fault && (
                <p className="font-sans text-sm leading-relaxed text-ink-2 pl-8 pt-1 pb-1.5"><InlineText text={fault} /></p>
              )}
            </div>
          );
        }}
      </Artifact>
    </div>
  );
}

function LineNumber({ index, marked }: { index: number; marked: boolean }) {
  return (
    <span className={`w-5 shrink-0 text-right select-none ${marked ? "text-signal-gap font-semibold" : "text-ink-3"}`}>
      {index + 1}
    </span>
  );
}

function Artifact({
  interaction,
  children,
}: {
  interaction: Diagnosis;
  children: (line: Diagnosis["artifact"]["lines"][number], index: number) => React.ReactNode;
}) {
  const { artifact } = interaction;
  return (
    <figure className="rounded-md border border-rule bg-sunken overflow-hidden">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <span className="eyebrow">{ARTIFACT_NAME[artifact.type]}{artifact.language ? ` · ${artifact.language}` : ""}</span>
        {artifact.caption && <span className="text-xs text-ink-3 truncate">{artifact.caption}</span>}
      </figcaption>
      <ol className="font-mono text-[0.8125rem] leading-relaxed py-1.5 overflow-x-auto">
        {artifact.lines.map((line, i) => (
          <li key={i}>{children(line, i)}</li>
        ))}
      </ol>
    </figure>
  );
}
