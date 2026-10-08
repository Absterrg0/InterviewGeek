import { describe, expect, it } from "vitest";
import { listConcepts } from "@/lib/content";
import { conceptQuestions } from "@/lib/concept-questions";

describe("conceptQuestions", () => {
  it("agrees the verb with singular and plural titles", () => {
    expect(conceptQuestions("Caching").failures).toBe("How does caching fail?");
    expect(conceptQuestions("Message queues").what).toBe("What are message queues in system design?");
    expect(conceptQuestions("State machines for business state").mechanism).toBe("How do state machines for business state work?");
    expect(conceptQuestions("Generating unique identifiers").what).toBe("What is generating unique identifiers in system design?");
    expect(conceptQuestions("Retries, backoff and jitter").failures).toBe("How do retries, backoff and jitter fail?");
  });

  it("asks about the head of a title with a qualifier", () => {
    expect(conceptQuestions("Server push: polling, long polling, SSE, WebSockets").mechanism).toBe("How does server push work?");
    expect(conceptQuestions("Log-structured storage (LSM trees)").problem).toBe("What problem does log-structured storage solve?");
  });

  it("produces a question for every concept", () => {
    for (const c of listConcepts()) {
      for (const q of Object.values(conceptQuestions(c.title))) expect(q).toMatch(/^[A-Z][^?]+\?$/);
    }
  });
});
