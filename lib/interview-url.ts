import { exerciseKey, type InterviewSession } from "@/lib/domain/learner";

/** Session URLs carry their item list so the server can render curated items. */
export function sessionUrl(session: InterviewSession): string {
  const items = session.items.map((i) => exerciseKey(i.exercise)).join(",");
  return `/interview/session?id=${encodeURIComponent(session.id)}&items=${encodeURIComponent(items)}`;
}
