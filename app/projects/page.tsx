import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProjectList } from "@/components/projects/project-list";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Your projects",
  description:
    "Describe a system you built and answer the questions an interviewer would ask about it.",
  path: "/projects",
});

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader title="Your projects">
        You built it. Can you explain how a request moves through it, which state survives a crash, and what happens
        when a dependency is slow? Model your system, then answer the questions it raises.
      </PageHeader>
      <ProjectList />
    </div>
  );
}
