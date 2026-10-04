/**
 * Human labels for any exercise ref, on the client. Curated exercises are
 * described by the server-provided summaries; project questions are derived
 * from the learner's own project models.
 */
import { exerciseKey, type ExerciseRef, type Project } from "@/lib/domain/learner";
import { findProjectQuestion } from "@/lib/domain/project-questions";

export type ExerciseLabel = { title: string; source: string; href: string };
export type CuratedLabels = Record<string, ExerciseLabel>;

export function labelFor(ref: ExerciseRef, curated: CuratedLabels, projects: readonly Project[]): ExerciseLabel | null {
  if (ref.kind === "project-question") {
    const project = projects.find((p) => p.id === ref.projectId);
    if (!project) return null;
    const question = findProjectQuestion(project, ref.questionId);
    return {
      title: question?.title ?? "A question about your project",
      source: project.name,
      href: `/projects/${project.id}#${ref.questionId}`,
    };
  }
  return curated[exerciseKey(ref)] ?? null;
}
