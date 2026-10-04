import type { Metadata } from "next";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { listConcepts } from "@/lib/content";

export const metadata: Metadata = { title: "Project" };

/** Projects live in the learner's browser, so the server renders only the shell. */
export default async function ProjectPage(props: PageProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  const concepts = Object.fromEntries(listConcepts().map((c) => [c.id, { title: c.title, summary: c.summary }]));
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <ProjectWorkspace projectId={projectId} concepts={concepts} />
    </div>
  );
}
