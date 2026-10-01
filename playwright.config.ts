import { resolve } from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: resolve(__dirname, "docker/.env") });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Specs share one live Bluesky test account; parallel files race on its state.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    // Caddy on 8090 via docker-compose.e2e.yml, bypassing Anubis.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8090",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Pinned so navigator.languages (resolveUiLocale's fallback) ignores the host locale.
    locale: "en-US",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/mobile\/.*\.spec\.ts/],
      dependencies: ["setup"],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
