/**
 * Concept titles phrased as the questions people search for: "How does caching fail?",
 * "What are message queues?". Titles are noun phrases of either number, so the verb follows them.
 */

/** "Server push: polling, long polling" and "Log-structured storage (LSM trees)" are asked about by their head. */
function head(title: string): string {
  return title.split(/[:(]/)[0]!.trim();
}

function isPlural(phrase: string): boolean {
  const words = phrase.toLowerCase().split(/\s+/);
  // "Generating unique identifiers" names one activity.
  if (words[0]!.endsWith("ing")) return false;
  if (phrase.includes(" and ")) return true;
  const plural = (w: string) => w.endsWith("s") && !/(ss|is|us)$/.test(w);
  return plural(words[words.length - 1]!) || words.slice(0, 2).some(plural);
}

export function conceptQuestions(title: string) {
  const subject = head(title);
  const name = subject.charAt(0).toLowerCase() + subject.slice(1);
  const plural = isPlural(subject);
  const does = plural ? "do" : "does";
  return {
    what: `What ${plural ? "are" : "is"} ${name} in system design?`,
    problem: `What problem ${does} ${name} solve?`,
    mechanism: `How ${does} ${name} work?`,
    assumptions: `What ${does} ${name} assume?`,
    failures: `How ${does} ${name} fail?`,
    alternatives: `What are the alternatives to ${name}?`,
  };
}
