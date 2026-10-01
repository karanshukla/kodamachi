import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router";

import { BounceLogosProvider } from "../components/BounceLogosContext";
import { I18nContext } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import type { Messages } from "../lib/i18n/types";

interface Options extends Omit<RenderOptions, "wrapper"> {
  route?: string;
  colorScheme?: "light" | "dark";
  messages?: Messages;
}

/**
 * Supplies i18n via `I18nContext` instead of the real `I18nProvider`, whose `useSession()`/`useUserSettings()`
 * calls break when a per-file mock narrows those modules. `Notifications` sits inside the provider because
 * its portal resolves context by tree position.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/", colorScheme, messages = en, ...options }: Options = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MantineProvider forceColorScheme={colorScheme}>
          <I18nContext.Provider value={{ locale: "en", messages }}>
            <Notifications />
            <MemoryRouter initialEntries={[route]}>
              <BounceLogosProvider>{children}</BounceLogosProvider>
            </MemoryRouter>
          </I18nContext.Provider>
        </MantineProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
