import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults } from "vitest/config";

import brand from "../brand.json" with { type: "json" };

// Not Vite's %VITE_*% replacement: that reads env vars, and brand.json is the source of truth.
function brandHtmlPlugin(): Plugin {
  return {
    name: "brand-html-vars",
    transformIndexHtml(html) {
      return html
        .replaceAll("%APP_NAME%", brand.appName)
        .replaceAll("%APP_DOMAIN%", brand.appDomain);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    brandHtmlPlugin(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // "autoUpdate" would reload mid-task; prompt mode surfaces the header's "Update" button instead.
      registerType: "prompt",
      // main.tsx registers via virtual:pwa-register to keep push registration in one place.
      injectRegister: false,

      manifest: {
        name: `${brand.appName} — anonymous questions`,
        short_name: brand.appName,
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      // #193: a stale worker intercepted TanStack Query's first fetches in dev; this also unregisters leftovers.
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/tests/setupTests.ts"],
    exclude: [...configDefaults.exclude, "**/*.e2e.test.ts"],
    coverage: {
      // Why istanbul: docs/runtime-notes.md. Suppress with `/* istanbul ignore */`, not `v8 ignore`.
      provider: "istanbul",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**"],
      exclude: [
        ...(configDefaults.coverage?.exclude ?? []),
        "src/tests/**",
        "src/main.tsx",
        "src/Theme.tsx",
        "src/vite-env.d.ts",
        "src/styles/tokens.ts",
        "src/**/*.styles.ts",
        "src/pushPayload.ts",
        "src/index.css",
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
