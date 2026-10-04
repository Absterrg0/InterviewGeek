import type { ConceptInput } from "@/lib/domain/content";
import { communicationConcepts } from "./communication";
import { concurrencyConcepts } from "./concurrency";
import { distributionConcepts } from "./distribution";
import { performanceConcepts } from "./performance";
import { reliabilityConcepts } from "./reliability";
import { storageConcepts } from "./storage";

export const allConcepts: ConceptInput[] = [
  ...communicationConcepts,
  ...storageConcepts,
  ...reliabilityConcepts,
  ...concurrencyConcepts,
  ...distributionConcepts,
  ...performanceConcepts,
];
