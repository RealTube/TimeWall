import { describe, expect, it } from "vitest";
import { completionFor, ghostTail } from "./completion";

const recent = ["standup", "Spec review", "outreach emails", "stand"];

describe("completionFor", () => {
  it("offers the most recent prefix match, case-insensitively", () => {
    expect(completionFor(recent, "st")).toBe("standup");
    expect(completionFor(recent, "SP")).toBe("Spec review");
  });

  it("needs at least two characters", () => {
    expect(completionFor(recent, "s")).toBeNull();
    expect(completionFor(recent, "")).toBeNull();
  });

  it("never completes to the identical text", () => {
    expect(completionFor(recent, "standup")).toBeNull();
    expect(completionFor(recent, "STANDUP")).toBeNull();
    // …but a shorter exact entry still completes to a longer one.
    expect(completionFor(["standup", "stand"], "stand")).toBe("standup");
  });

  it("matches prefixes only — no fuzzy guessing", () => {
    expect(completionFor(recent, "emails")).toBeNull();
  });

  it("ignores leading whitespace in the typed text", () => {
    expect(completionFor(recent, "  st")).toBe("standup");
  });
});

describe("ghostTail", () => {
  it("returns the untyped remainder of the suggestion", () => {
    expect(ghostTail("standup", "st")).toBe("andup");
    expect(ghostTail("Spec review", "spec ")).toBe("review");
  });
});
