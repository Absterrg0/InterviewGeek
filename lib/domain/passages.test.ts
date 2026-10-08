import { describe, expect, it } from "vitest";
import { splitPassages } from "./passages";

describe("splitPassages", () => {
  it("splits prose into sentences and list items", () => {
    expect(
      splitPassages("Use a token bucket. It allows bursts! Does it hold?\n\n- Store it in Redis.\n2. Fail open after 5 ms."),
    ).toEqual(["Use a token bucket.", "It allows bursts!", "Does it hold?", "Store it in Redis.", "Fail open after 5 ms."]);
  });

  it("does not split on decimals or abbreviations followed by lowercase", () => {
    expect(splitPassages("Latency is 0.3 ms per call, e.g. in-region. That is fine.")).toEqual([
      "Latency is 0.3 ms per call, e.g. in-region.",
      "That is fine.",
    ]);
  });

  it("splits code into meaningful lines", () => {
    expect(splitPassages("local t = redis.call('TIME')\n\n  }\nreturn t\n", "code")).toEqual([
      "local t = redis.call('TIME')",
      "return t",
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(splitPassages("   \n  ")).toEqual([]);
  });
});
