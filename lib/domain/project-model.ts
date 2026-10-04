/**
 * Editing a project's architecture model. The editor works on a draft and
 * saves only when the draft is valid, so stored learner state never holds a
 * half-described component.
 */
import type { Project } from "./learner";

export type ProjectModel = Pick<Project, "components" | "flows" | "invariants">;

export function modelOf(project: Project): ProjectModel {
  return { components: project.components, flows: project.flows, invariants: project.invariants };
}

/** Problems that block saving, phrased for the person editing. */
export function modelProblems(model: ProjectModel): string[] {
  const problems: string[] = [];
  const ids = new Set(model.components.map((c) => c.id));
  const name = (id: string) => model.components.find((c) => c.id === id)?.label || id;
  for (const c of model.components) {
    if (!c.label.trim()) problems.push("Every component needs a name.");
    if (!c.responsibility.trim()) problems.push(`Say what "${c.label || "unnamed component"}" is responsible for.`);
  }
  for (const f of model.flows) {
    if (!f.label.trim()) problems.push(`Describe the flow from ${name(f.from)} to ${name(f.to)}.`);
    if (!ids.has(f.from) || !ids.has(f.to)) problems.push(`A flow refers to a component that no longer exists.`);
    if (f.from === f.to) problems.push(`A flow cannot go from ${name(f.from)} to itself.`);
  }
  for (const inv of model.invariants) {
    if (!inv.statement.trim()) problems.push("Every invariant needs a statement.");
    if (inv.enforcedBy.some((id) => !ids.has(id))) problems.push(`"${inv.statement}" refers to a removed component.`);
  }
  return [...new Set(problems)];
}

/** Removing a component removes its flows and its share of enforcing invariants. */
export function removeComponent(model: ProjectModel, componentId: string): ProjectModel {
  return {
    components: model.components.filter((c) => c.id !== componentId),
    flows: model.flows.filter((f) => f.from !== componentId && f.to !== componentId),
    invariants: model.invariants.map((inv) => ({
      ...inv,
      enforcedBy: inv.enforcedBy.filter((id) => id !== componentId),
    })),
  };
}
