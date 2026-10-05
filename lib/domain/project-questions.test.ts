import { describe, expect, it } from "vitest";
import { getConcept } from "@/lib/content";
import type { Project } from "./learner";
import { PROJECT_QUESTION_ID_RE } from "./learner";
import { findProjectQuestion, projectQuestions, templateConceptIds } from "./project-questions";

const project: Project = {
  id: "shop",
  name: "Shop",
  summary: "",
  source: { type: "manual" },
  components: [
    { id: "web", label: "Web app", kind: "client", responsibility: "UI" },
    { id: "api", label: "API", kind: "service", responsibility: "Orders" },
    { id: "db", label: "Postgres", kind: "database", responsibility: "Orders", durableState: "orders" },
    { id: "stripe", label: "Stripe", kind: "external", responsibility: "Payments" },
    { id: "mailer", label: "Mailer", kind: "worker", responsibility: "Emails" },
  ],
  flows: [
    { id: "checkout", from: "web", to: "api", label: "Checkout", kind: "request" },
    { id: "send-email", from: "api", to: "mailer", label: "Send receipt", kind: "async" },
  ],
  invariants: [{ id: "one-order", statement: "One order per cart", enforcedBy: ["db"], mechanism: "unique" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("project questions", () => {
  it("derives questions from the model", () => {
    const ids = projectQuestions(project).map((q) => q.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "trace.checkout",
        "durable.db",
        "dependency.db",
        "dependency.stripe",
        "redelivery.send-email",
        "invariant.one-order",
        "boundary.mailer",
        "retry",
        "scale",
      ]),
    );
    expect(ids).not.toContain("dependency.api");
  });

  it("produces unique, valid ids that round-trip", () => {
    const ids = projectQuestions(project).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(PROJECT_QUESTION_ID_RE.test(id), id).toBe(true);
      expect(findProjectQuestion(project, id)?.id).toBe(id);
    }
  });

  it("only references concepts that exist", () => {
    for (const id of templateConceptIds()) expect(getConcept(id), id).toBeDefined();
  });

  it("gives every question a core rubric point", () => {
    for (const q of projectQuestions(project)) {
      expect(q.interaction.rubric.some((r) => r.weight === "core"), q.id).toBe(true);
    }
  });
});
