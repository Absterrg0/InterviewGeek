/**
 * Splitting a learner's written answer into passages they can point at.
 *
 * Self-assessment asks "which part of your answer says this?" rather than
 * "did you cover this?". Pointing at a sentence is harder to fool yourself
 * with than ticking a box, and it needs no grader. Prose splits into
 * sentences (and list items); code splits into its non-blank lines.
 */

/** Sentence ends: punctuation, then space, then something that starts a sentence. */
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9"'“‘(\[`*_-])/u;
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/u;

export function splitPassages(text: string, mode: "prose" | "code" = "prose"): string[] {
  const lines = text.split(/\r?\n/);
  if (mode === "code") {
    return lines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 1 && !/^[\s{}()[\];,]+$/.test(l));
  }
  const passages: string[] = [];
  for (const line of lines) {
    const content = line.replace(LIST_MARKER, "").trim();
    if (!content) continue;
    for (const sentence of content.split(SENTENCE_END)) {
      const s = sentence.trim();
      if (s.length > 0) passages.push(s);
    }
  }
  return passages;
}
