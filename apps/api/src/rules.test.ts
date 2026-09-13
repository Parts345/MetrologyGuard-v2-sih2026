import { describe, expect, it } from "vitest";
import { RULES, ruleForKey } from "./rules.js";

describe("supported rule definitions", () => {
  it("contains the six model-backed declaration checks", () => {
    expect(RULES).toHaveLength(6);
    expect(RULES.map((rule) => rule.code)).toContain("Rule 6(1)");
    expect(RULES.map((rule) => rule.code)).toContain("FSSAI");
  });
  it("keeps unknown output at a manual-review boundary", () => {
    expect(ruleForKey("Future check").evaluation).toBe("Manual review required");
  });
});
