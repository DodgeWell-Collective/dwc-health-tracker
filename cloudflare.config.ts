import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "dwc-health-tracker",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-17",
    compatibilityFlags: ["nodejs_compat"],
    // Served at <name>.<your-subdomain>.workers.dev. To use your own domain instead, add
    // `domains: ["health.example.com"]` and set workersDev to false.
    workersDev: true,
    previewUrls: false,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Secrets: set with `npx wrangler secret put <NAME> --name dwc-health-tracker`
      // or in the dashboard (Worker → Settings → Variables and Secrets).
      // The first sign-in password; the app stays locked until it is set. Change it later in Settings.
      APP_PASSWORD: bindings.secret(),
      // Optional: enables "describe it to Claude" and recipe ideas.
      ANTHROPIC_API_KEY: bindings.secret(),
      // Optional: free key from api.data.gov/signup (lib/foods.ts falls back to DEMO_KEY).
      USDA_API_KEY: bindings.secret(),
      // Created on first deploy.
      DB: bindings.d1({ name: "dwc-health-tracker" }),
    },
  }),
});
