import { describe, expect, it } from "vitest";
import { getInvestigation, listInvestigations } from ".";
import { designReference, interviewPrompt } from "./design-reference";

describe("interviewPrompt", () => {
  it("drops sentences about the investigation and empty paragraphs", () => {
    expect(
      interviewPrompt("Users post.\n\nScale is large. This investigation follows them.\n\nThis investigation walks through it."),
    ).toBe("Users post.\n\nScale is large.");
  });

  it("leaves no meta sentences in any real scenario", () => {
    for (const inv of listInvestigations()) {
      expect(interviewPrompt(inv.scenario), inv.id).not.toMatch(/this investigation/i);
    }
  });
});

describe("designReference", () => {
  it("gives every section of every investigation something to compare against", () => {
    for (const inv of listInvestigations()) {
      const ref = designReference(inv);
      for (const [section, items] of Object.entries(ref)) {
        expect(items.length, `${inv.id} ${section}`).toBeGreaterThan(0);
        expect(new Set(items.map((i) => i.id)).size, `${inv.id} ${section} ids unique`).toBe(items.length);
      }
    }
  });

  it("uses lesson estimates when an investigation has them", () => {
    const ref = designReference(getInvestigation("url-shortener")!);
    expect(ref.estimates.some((i) => i.id.startsWith("estimate-"))).toBe(true);
  });
});
