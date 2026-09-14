import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Wordmark } from "../../components/Wordmark";
import { APP_NAME } from "../../lib/brand";
import { renderWithProviders } from "../testUtils";

describe("Wordmark", () => {
  it("includes the mark tile when showMark is true (default)", () => {
    const { container } = renderWithProviders(<Wordmark />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("does not include the mark tile when showMark is false", () => {
    const { container } = renderWithProviders(<Wordmark showMark={false} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the app name as one word", () => {
    renderWithProviders(<Wordmark showMark={false} />);
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
  });
});
