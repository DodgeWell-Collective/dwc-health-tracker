import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the Cloudflare/vinext plugins.
// Tests cover the pure lib/ modules (the app's math) and the Node SQLite shim; no network.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
