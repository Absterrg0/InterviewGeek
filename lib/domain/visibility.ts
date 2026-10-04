import type { Investigation } from "./content";

export type Visible = { components: Set<string>; flows: Set<string> };

/**
 * Which parts of an investigation's system map exist after the first `count`
 * stages have been understood. Parts that no stage reveals are there from the
 * start: they are the givens of the scenario.
 */
export function visibleAfter(investigation: Investigation, count: number): Visible {
  const revealedLater = { components: new Set<string>(), flows: new Set<string>() };
  investigation.stages.forEach((stage, i) => {
    if (i < count) return;
    for (const id of stage.reveals?.components ?? []) revealedLater.components.add(id);
    for (const id of stage.reveals?.flows ?? []) revealedLater.flows.add(id);
  });
  return {
    components: new Set(
      investigation.system.components.map((c) => c.id).filter((id) => !revealedLater.components.has(id)),
    ),
    flows: new Set(investigation.system.flows.map((f) => f.id).filter((id) => !revealedLater.flows.has(id))),
  };
}
