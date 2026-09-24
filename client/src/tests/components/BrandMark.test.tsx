import { render } from "@testing-library/react";
import React from "react";
import { describe, it, expect } from "vitest";

import { BrandMark } from "../../components/BrandMark";
import { APP_NAME } from "../../lib/brand";

describe("BrandMark", () => {
  it("renders the bare sprout bulb with no tile behind it", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/mascot/sprout-mark.webp");
    expect(container.querySelector("svg, rect")).toBeNull();
  });

  it("applies the size prop to width and height attributes", () => {
    const { container } = render(<BrandMark size={64} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("width")).toBe("64");
    expect(img.getAttribute("height")).toBe("64");
  });

  it("is announced as the app name when aria-hidden is not set", () => {
    const { container } = render(<BrandMark />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(APP_NAME);
    expect(img.getAttribute("aria-hidden")).toBeNull();
  });

  it("is silent when aria-hidden is true", () => {
    const { container } = render(<BrandMark aria-hidden />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });
});
