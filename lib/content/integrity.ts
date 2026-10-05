/**
 * Cross-reference checks for curated content. The schemas validate each
 * document's shape; this validates the graph between documents: every id a
 * document mentions must exist, and ids must be unique where they are keys.
 */
import type { Company, Concept, Investigation, Writeup } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";

const CONCEPT_REF = /\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;

/** Every [[concept-id]] reference inside any string of a value. */
export function conceptReferences(value: unknown): string[] {
  const found: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      for (const match of v.matchAll(CONCEPT_REF)) found.push(match[1] as string);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v !== null && typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(value);
  return found;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

const RESERVED_STAGE_IDS = new Set(["review"]);

export function checkContentIntegrity(
  investigations: readonly Investigation[],
  concepts: readonly Concept[],
): string[] {
  const errors: string[] = [];
  const conceptIds = new Set(concepts.map((c) => c.id));
  const investigationIds = new Set(investigations.map((i) => i.id));

  for (const id of duplicates(investigations.map((i) => i.id))) errors.push(`duplicate investigation id "${id}"`);
  for (const id of duplicates(concepts.map((c) => c.id))) errors.push(`duplicate concept id "${id}"`);

  const requireConcept = (where: string, id: string) => {
    if (!conceptIds.has(id)) errors.push(`${where}: unknown concept "${id}"`);
  };

  for (const inv of investigations) {
    const at = `investigation ${inv.id}`;
    const componentIds = new Set(inv.system.components.map((c) => c.id));
    const flowIds = new Set(inv.system.flows.map((f) => f.id));
    const competencyIds = new Set(inv.competencies.map((c) => c.id));

    for (const id of duplicates(inv.stages.map((s) => s.id))) errors.push(`${at}: duplicate stage id "${id}"`);
    for (const id of duplicates(inv.system.flows.map((f) => f.id))) errors.push(`${at}: duplicate flow id "${id}"`);
    for (const id of duplicates(inv.system.components.map((c) => c.id)))
      errors.push(`${at}: duplicate component id "${id}"`);
    for (const id of duplicates(inv.competencies.map((c) => c.id)))
      errors.push(`${at}: duplicate competency id "${id}"`);

    const positions = inv.system.components.map((c) => `${c.position.col},${c.position.row}`);
    for (const p of duplicates(positions)) errors.push(`${at}: two components placed at ${p}`);

    for (const flow of inv.system.flows) {
      if (!componentIds.has(flow.from)) errors.push(`${at}: flow ${flow.id} from unknown component "${flow.from}"`);
      if (!componentIds.has(flow.to)) errors.push(`${at}: flow ${flow.id} to unknown component "${flow.to}"`);
    }
    for (const inv2 of inv.system.invariants) {
      for (const c of inv2.enforcedBy) {
        if (!componentIds.has(c)) errors.push(`${at}: invariant ${inv2.id} enforced by unknown "${c}"`);
      }
    }
    for (const id of inv.prerequisites) requireConcept(`${at} prerequisites`, id);
    for (const id of inv.relatedInvestigationIds) {
      if (!investigationIds.has(id)) errors.push(`${at}: unknown related investigation "${id}"`);
      if (id === inv.id) errors.push(`${at}: lists itself as related`);
    }

    const usedCompetencies = new Set<string>();
    for (const stage of inv.stages) {
      const where = `${at} stage ${stage.id}`;
      if (RESERVED_STAGE_IDS.has(stage.id)) errors.push(`${where}: stage id is reserved`);
      for (const id of stage.conceptIds) requireConcept(where, id);
      for (const id of stage.competencyIds) {
        usedCompetencies.add(id);
        if (!competencyIds.has(id)) errors.push(`${where}: unknown competency "${id}"`);
      }
      for (const id of stage.reveals?.components ?? []) {
        if (!componentIds.has(id)) errors.push(`${where}: reveals unknown component "${id}"`);
      }
      for (const id of stage.reveals?.flows ?? []) {
        if (!flowIds.has(id)) errors.push(`${where}: reveals unknown flow "${id}"`);
      }
      errors.push(...checkInteraction(where, stage.interaction));
    }
    for (const c of inv.competencies) {
      if (!usedCompetencies.has(c.id)) errors.push(`${at}: competency "${c.id}" is never exercised`);
    }

    // At every point in the investigation, visible flows connect visible components.
    for (let count = 0; count <= inv.stages.length; count++) {
      const visible = visibleAfter(inv, count);
      for (const flow of inv.system.flows) {
        if (!visible.flows.has(flow.id)) continue;
        if (!visible.components.has(flow.from) || !visible.components.has(flow.to)) {
          errors.push(`${at}: flow ${flow.id} is visible after ${count} stages but an endpoint is not`);
          break;
        }
      }
    }

    for (const id of conceptReferences(inv)) requireConcept(`${at} prose`, id);
  }

  for (const concept of concepts) {
    const at = `concept ${concept.id}`;
    for (const id of concept.relatedConceptIds) {
      requireConcept(at, id);
      if (id === concept.id) errors.push(`${at}: lists itself as related`);
    }
    for (const id of duplicates(concept.claims.map((c) => c.id))) errors.push(`${at}: duplicate claim id "${id}"`);
    for (const id of duplicates(concept.explain.rubric.map((r) => r.id)))
      errors.push(`${at}: duplicate rubric id "${id}"`);
    if (!concept.explain.rubric.some((r) => r.weight === "core")) errors.push(`${at}: explain rubric has no core point`);
    for (const id of conceptReferences(concept)) requireConcept(`${at} prose`, id);
  }

  return errors;
}

/** Sources: every writeup belongs to a company and links to things that exist. */
export function checkSourceIntegrity(
  companies: readonly Company[],
  writeups: readonly Writeup[],
  investigations: readonly Investigation[],
  concepts: readonly Concept[],
): string[] {
  const errors: string[] = [];
  const companyIds = new Set(companies.map((c) => c.id));
  const investigationIds = new Set(investigations.map((i) => i.id));
  const conceptIds = new Set(concepts.map((c) => c.id));

  for (const id of duplicates(companies.map((c) => c.id))) errors.push(`duplicate company id "${id}"`);
  for (const id of duplicates(writeups.map((w) => w.id))) errors.push(`duplicate writeup id "${id}"`);
  for (const url of duplicates(writeups.map((w) => w.url))) errors.push(`two writeups share the url ${url}`);

  for (const w of writeups) {
    const at = `writeup ${w.id}`;
    if (!companyIds.has(w.companyId)) errors.push(`${at}: unknown company "${w.companyId}"`);
    for (const id of w.investigationIds) {
      if (!investigationIds.has(id)) errors.push(`${at}: unknown investigation "${id}"`);
    }
    for (const id of w.conceptIds) {
      if (!conceptIds.has(id)) errors.push(`${at}: unknown concept "${id}"`);
    }
    for (const id of conceptReferences(w)) {
      if (!conceptIds.has(id)) errors.push(`${at} prose: unknown concept "${id}"`);
    }
  }
  for (const c of companies) {
    const own = writeups.filter((w) => w.companyId === c.id);
    if (own.length === 0) errors.push(`company ${c.id} has no writeups`);
    else if (!own.some((w) => w.investigationIds.length > 0)) errors.push(`company ${c.id} has nothing to practise`);
    for (const id of conceptReferences(c)) {
      if (!conceptIds.has(id)) errors.push(`company ${c.id} prose: unknown concept "${id}"`);
    }
  }
  return errors;
}

function checkInteraction(where: string, interaction: Investigation["stages"][number]["interaction"]): string[] {
  const errors: string[] = [];
  const rubricIds = (rubric: readonly { id: string; weight: string }[]) => {
    for (const id of duplicates(rubric.map((r) => r.id))) errors.push(`${where}: duplicate rubric id "${id}"`);
    if (!rubric.some((r) => r.weight === "core")) errors.push(`${where}: rubric has no core point`);
  };
  switch (interaction.kind) {
    case "decision":
      for (const id of duplicates(interaction.options.map((o) => o.id))) errors.push(`${where}: duplicate option "${id}"`);
      if (interaction.options.every((o) => o.assessment === "flawed"))
        errors.push(`${where}: every option is flawed`);
      rubricIds(interaction.rationale.rubric);
      break;
    case "claims":
      for (const id of duplicates(interaction.claims.map((c) => c.id))) errors.push(`${where}: duplicate claim "${id}"`);
      break;
    case "ordering":
      for (const id of duplicates(interaction.items.map((i) => i.id))) errors.push(`${where}: duplicate item "${id}"`);
      break;
    case "diagnosis":
      if (!interaction.artifact.lines.some((l) => l.fault)) errors.push(`${where}: diagnosis has no faulty line`);
      rubricIds(interaction.rationale.rubric);
      break;
    case "open":
    case "implementation":
      rubricIds(interaction.rubric);
      break;
  }
  return errors;
}
