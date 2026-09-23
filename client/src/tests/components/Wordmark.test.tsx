import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Wordmark } from "../../components/Wordmark";
import { APP_NAME } from "../../lib/brand";
import { renderWithProviders } from "../testUtils";

describe("Wordmark", () => {
  it("renders the app name as one word, with no mark", () => {
    const { container } = renderWithProviders(<Wordmark />);
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });
});
