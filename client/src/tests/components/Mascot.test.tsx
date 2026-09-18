import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Mascot } from "../../components/Mascot";
import { mascotSrc } from "../../lib/mascot";

vi.mock("../../lib/mascot", () => ({ mascotSrc: vi.fn() }));

describe("Mascot", () => {
  beforeEach(() => {
    vi.mocked(mascotSrc).mockReset();
  });

  it("renders the fallback while the mood has no artwork", () => {
    render(<Mascot mood="error" size={148} fallback={<span>icon</span>} />);
    expect(screen.getByText("icon")).toBeTruthy();
    expect(mascotSrc).toHaveBeenCalledWith("error");
  });

  it("renders nothing without artwork or a fallback", () => {
    const { container } = render(<Mascot mood="neutral" size={148} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the artwork as a decorative image at the given height", () => {
    vi.mocked(mascotSrc).mockReturnValue("/assets/success.webp");
    const { container } = render(
      <Mascot mood="success" size={104} fallback={<span>icon</span>} style={{ marginBottom: 16 }} />
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/assets/success.webp");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.style.height).toBe("104px");
    expect(img.style.marginBottom).toBe("16px");
    expect(screen.queryByText("icon")).toBeNull();
  });
});
