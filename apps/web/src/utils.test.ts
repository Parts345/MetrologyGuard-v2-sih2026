import { describe, expect, it } from "vitest";
import { titleStatus } from "./utils";

describe("status presentation", () => {
  it("turns persisted backend statuses into readable labels", () => {
    expect(titleStatus("NON_COMPLIANT")).toBe("Non Compliant");
    expect(titleStatus("PARTIAL")).toBe("Partial");
  });
});
