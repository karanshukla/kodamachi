import { Alert } from "@mantine/core";
import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { LocalisedDefaults } from "../../components/LocalisedDefaults";
import { en } from "../../lib/i18n/en";
import { renderWithProviders } from "../testUtils";

describe("LocalisedDefaults", () => {
  it("gives a close button the translated accessible name", () => {
    renderWithProviders(
      <LocalisedDefaults>
        <Alert withCloseButton>Something went wrong</Alert>
      </LocalisedDefaults>
    );
    expect(screen.getByRole("button", { name: en.common.close })).toBeInTheDocument();
  });
});
