import { render } from "@testing-library/react";
import React from "react";
import { describe, it, expect } from "vitest";

import { BrandMark } from "../../components/BrandMark";
import { APP_NAME, MARK_GLYPH_PATH } from "../../lib/brand";

describe("BrandMark", () => {
  it("renders the 木 tile without crashing with default props", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("path")!.getAttribute("d")).toBe(MARK_GLYPH_PATH);
  });

  it("applies the size prop to width and height attributes", () => {
    const { container } = render(<BrandMark size={64} />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("64");
    expect(svg!.getAttribute("height")).toBe("64");
  });

  it("paints the tile and glyph from the scheme-aware mark tokens, not literal hues", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe("var(--ds-mark-bg)");
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("var(--ds-mark-fg)");
  });

  it("sets role=img and aria-label when aria-hidden is not set", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("role")).toBe("img");
    expect(svg!.getAttribute("aria-label")).toBe(APP_NAME);
  });

  it("omits role and aria-label when aria-hidden is true", () => {
    const { container } = render(<BrandMark aria-hidden />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("role")).toBeNull();
    expect(svg!.getAttribute("aria-label")).toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
});
