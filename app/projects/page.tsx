import type { Metadata } from "next";
import { ProjectList } from "@/components/projects/project-list";

export const metadata: Metadata = {
  title: "Your projects",
  description: "Describe a system you built and answer the questions an interviewer would ask about it.",
};

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl mb-12">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Your projects</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          You built it. Can you explain how a request moves through it, which state survives a crash, and what happens
          when a dependency is slow? Model your system, then answer the questions it raises.
        </p>
      </header>
      <ProjectList />
    </div>
  );
}
