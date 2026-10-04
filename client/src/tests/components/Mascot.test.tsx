import { render } from "@testing-library/react";
import React from "react";
import { describe, it, expect } from "vitest";

import { Mascot } from "../../components/Mascot";

describe("Mascot", () => {
  it("renders the pose's sprite at the given size, hidden from assistive tech", () => {
    const { container } = render(<Mascot pose="greeting" size={120} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/mascot/greeting.webp");
    expect(img.getAttribute("width")).toBe("120");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("hops only when asked to", () => {
    const still = render(<Mascot pose="idle" size={80} />).container.querySelector("img")!;
    const hopping = render(<Mascot pose="idle" size={80} hop />).container.querySelector("img")!;
    expect(still.classList.contains("ds-mascot-hop")).toBe(false);
    expect(hopping.classList.contains("ds-mascot-hop")).toBe(true);
  });

  it("lets the caller's style override the frame", () => {
    const { container } = render(<Mascot pose="sprout" size={64} style={{ margin: 0 }} />);
    expect(container.querySelector("img")!.style.margin).toBe("0px");
  });
});
