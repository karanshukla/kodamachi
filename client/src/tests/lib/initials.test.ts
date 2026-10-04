import { describe, it, expect } from "vitest";

import { initialsOf } from "../../lib/initials";

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Karan Shukla")).toBe("KS");
    expect(initialsOf("mio ren tanaka")).toBe("MR");
  });

  it("takes one letter from a single word, and splits a handle on its dots", () => {
    expect(initialsOf("mio")).toBe("M");
    expect(initialsOf("@karan.bsky.social")).toBe("KB");
  });

  it("falls back to a question mark with nothing to draw from", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
  });
});
