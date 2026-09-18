import { describe, it, expect } from "vitest";

import { artByName, mascotSrc } from "../../lib/mascot";

describe("artByName", () => {
  it("keys each file by its name without the extension", () => {
    expect(
      artByName({
        "../assets/mascot/success.webp": "/assets/success-abc.webp",
        "../assets/mascot/mark.svg": "/assets/mark-def.svg",
      })
    ).toEqual({ success: "/assets/success-abc.webp", mark: "/assets/mark-def.svg" });
  });

  it("returns an empty map when no artwork exists", () => {
    expect(artByName({})).toEqual({});
  });
});

describe("mascotSrc", () => {
  it("is undefined while assets/mascot/ holds no artwork", () => {
    expect(mascotSrc("neutral")).toBeUndefined();
  });
});
