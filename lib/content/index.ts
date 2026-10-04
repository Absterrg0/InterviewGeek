/**
 * The curated content library. Parsed once at module load, so a malformed
 * document fails the build (static generation imports this) rather than
 * rendering half a page. Server-only by convention: client components receive
 * the pieces they need as props instead of importing the whole library.
 */
import { z } from "zod";
import {
  company,
  concept,
  investigation,
  writeup,
  type Company,
  type Concept,
  type ConceptDomain,
  type Investigation,
  type Stage,
  type Writeup,
} from "@/lib/domain/content";
import { allConcepts } from "./concepts";
import { allInvestigations } from "./investigations";
import { allCompanies, allWriteups } from "./sources";

function parseAll<T>(schema: z.ZodType<T>, inputs: readonly { id: string }[], kind: string): T[] {
  return inputs.map((input) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new Error(`Invalid ${kind} "${input.id}":\n${z.prettifyError(result.error)}`);
    }
    return result.data;
  });
}

const investigations: Investigation[] = parseAll(investigation, allInvestigations, "investigation");
const concepts: Concept[] = parseAll(concept, allConcepts, "concept");
const companies: Company[] = parseAll(company, allCompanies, "company");
/** Newest first, so lists lead with the current state of each system. */
const writeups: Writeup[] = parseAll(writeup, allWriteups, "writeup").sort((a, b) =>
  b.published.localeCompare(a.published),
);

const investigationById = new Map(investigations.map((i) => [i.id, i]));
const conceptById = new Map(concepts.map((c) => [c.id, c]));
const companyById = new Map(companies.map((c) => [c.id, c]));

export function listInvestigations(): Investigation[] {
  return investigations;
}

export function getInvestigation(id: string): Investigation | undefined {
  return investigationById.get(id);
}

export function getStage(
  investigationId: string,
  stageId: string,
): { investigation: Investigation; stage: Stage; index: number } | undefined {
  const inv = investigationById.get(investigationId);
  if (!inv) return undefined;
  const index = inv.stages.findIndex((s) => s.id === stageId);
  const stage = inv.stages[index];
  return stage ? { investigation: inv, stage, index } : undefined;
}

export function listConcepts(): Concept[] {
  return concepts;
}

export function getConcept(id: string): Concept | undefined {
  return conceptById.get(id);
}

export function conceptsByDomain(): Map<ConceptDomain, Concept[]> {
  const groups = new Map<ConceptDomain, Concept[]>();
  for (const c of concepts) {
    const group = groups.get(c.domain);
    if (group) group.push(c);
    else groups.set(c.domain, [c]);
  }
  return groups;
}

/** Stages, across all investigations, that exercise a concept. */
export function stagesUsingConcept(conceptId: string): { investigation: Investigation; stage: Stage }[] {
  return investigations.flatMap((inv) =>
    inv.stages.filter((s) => s.conceptIds.includes(conceptId)).map((stage) => ({ investigation: inv, stage })),
  );
}

/** Concepts that link here, so concept pages can show the graph in both directions. */
export function conceptsReferencing(conceptId: string): Concept[] {
  return concepts.filter((c) => c.relatedConceptIds.includes(conceptId));
}

export function listCompanies(): Company[] {
  return companies;
}

export function getCompany(id: string): Company | undefined {
  return companyById.get(id);
}

export function listWriteups(): Writeup[] {
  return writeups;
}

export function writeupsByCompany(companyId: string): Writeup[] {
  return writeups.filter((w) => w.companyId === companyId);
}

/** The published accounts an investigation is built from. */
export function writeupsForInvestigation(investigationId: string): Writeup[] {
  return writeups.filter((w) => w.investigationIds.includes(investigationId));
}

/** Production accounts of a concept at work. */
export function writeupsForConcept(conceptId: string): Writeup[] {
  return writeups.filter((w) => w.conceptIds.includes(conceptId));
}
