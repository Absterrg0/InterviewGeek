"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { InlineText } from "@/components/prose-core";
import { Segmented, VERDICT_LABEL } from "@/components/ui";
import type { Claim } from "@/lib/domain/content";
import { CLAIM_VERDICTS, type ClaimVerdict } from "@/lib/domain/taxonomy";
import { shuffled } from "@/lib/domain/evaluate";
import { submitAttempt, useLearnerState } from "@/lib/store/learner-store";

export type DrillConcept = { id: string; title: string; claims: Claim[] };
type DrillClaim = { conceptId: string; conceptTitle: string; claim: Claim };

const SET_SIZE = 8;
const OPTIONS = CLAIM_VERDICTS.map((v) => ({
  value: v,
  label: VERDICT_LABEL[v],
}));

/**
 * Rapid verdicts on statements drawn from every concept, many of them the
 * vague "X makes things faster" kind that sound right. Each answered claim is
 * recorded as checked evidence against its concept.
 */
export function ClaimDrill({
  concepts,
  explanations,
}: {
  concepts: DrillConcept[];
  explanations: Record<string, ReactNode>;
}) {
  const state = useLearnerState();
  const [round, setRound] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, ClaimVerdict>>({});
  const [checked, setChecked] = useState(false);

  const all: DrillClaim[] = concepts.flatMap((c) =>
    c.claims.map((claim) => ({
      conceptId: c.id,
      conceptTitle: c.title,
      claim,
    })),
  );
  const set = shuffled(all, `drill-${round}`).slice(0, SET_SIZE);
  const keyOf = (d: DrillClaim) => `${d.conceptId}/${d.claim.id}`;
  const answered = set.filter((d) => verdicts[keyOf(d)]).length;
  const correct = set.filter((d) => verdicts[keyOf(d)] === d.claim.verdict).length;

  const check = () => {
    // One attempt per concept, carrying only the claims answered here.
    for (const concept of concepts) {
      const mine = set.filter((d) => d.conceptId === concept.id);
      if (mine.length === 0) continue;
      const picked: Record<string, ClaimVerdict> = {};
      for (const d of mine) {
        const v = verdicts[keyOf(d)];
        if (v) picked[d.claim.id] = v;
      }
      submitAttempt({
        exercise: { kind: "concept-claims", conceptId: concept.id },
        interaction: {
          kind: "claims",
          prompt: "Decide whether each statement holds.",
          claims: concept.claims,
        },
        tags: {
          dimensions: ["explain"],
          conceptIds: [concept.id],
          competencyIds: [],
        },
        response: { kind: "claims", verdicts: picked },
        context: "practice",
      });
    }
    setChecked(true);
  };

  const next = () => {
    setRound(round + 1);
    setVerdicts({});
    setChecked(false);
  };

  return (
    <div>
      <ol className="panel divide-y divide-rule-soft">
        {set.map((d, i) => {
          const key = keyOf(d);
          const mine = verdicts[key];
          const right = mine === d.claim.verdict;
          return (
            <li key={key} className="px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-[0.875rem] leading-relaxed">
                    <span className="mr-2.5 font-mono text-[0.625rem] tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <InlineText text={d.claim.statement} />
                  </p>
                  <Link
                    href={`/concepts/${d.conceptId}`}
                    className="mt-0.5 ml-7 inline-block text-[0.75rem] text-ink-3 hover:text-accent"
                  >
                    {d.conceptTitle}
                  </Link>
                </div>
                <Segmented
                  name={`drill-${round}-${key}`}
                  legend={`Verdict for statement ${i + 1}`}
                  hideLegend
                  options={OPTIONS}
                  value={mine}
                  disabled={checked}
                  onChange={(v) => setVerdicts({ ...verdicts, [key]: v })}
                />
              </div>
              {checked && (
                <div className="mt-3 ml-7 rounded-lg bg-well px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--rule-soft)]">
                  <p
                    className={`inline-flex items-center gap-2 text-[0.8125rem] font-medium ${right ? "text-signal-strong" : "text-signal-gap"}`}
                  >
                    <span className={`led ${right ? "led-strong" : "led-gap"} size-1.5`} aria-hidden="true" />
                    {right ? "Right:" : "Not quite:"} it {VERDICT_LABEL[d.claim.verdict].toLowerCase()}.
                  </p>
                  <div className="mt-1 text-ink-2">{explanations[key]}</div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {checked ? (
          <>
            <p className="text-sm text-ink-2" role="status">
              {correct} of {set.length} right. Recorded against each concept as checked evidence.
            </p>
            <button type="button" className="btn btn-primary" onClick={next}>
              Another set
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={answered < set.length || !state}
              onClick={check}
            >
              Check verdicts
            </button>
            <p className="text-sm text-ink-3">
              {answered} of {set.length} answered
            </p>
          </>
        )}
      </div>
    </div>
  );
}
