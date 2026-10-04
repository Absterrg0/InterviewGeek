import { getConcept } from "@/lib/content";
import { ProseView, type ConceptResolver } from "./prose-core";

const resolve: ConceptResolver = (id) => getConcept(id);

/** Server-side prose with concept references resolved against the library. */
export function Prose({ text, className }: { text: string; className?: string }) {
  return <ProseView text={text} resolve={resolve} className={className} />;
}
