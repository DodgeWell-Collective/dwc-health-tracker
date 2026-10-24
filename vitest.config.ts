import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the Cloudflare/vinext plugins.
// Tests cover the pure lib/ modules (the app's math), the Node SQLite shim and sign-in;
// cloudflare:workers resolves to the shim, so no network.
export default defineConfig({
  resolve: { alias: [{ find: "cloudflare:workers", replacement: fileURLToPath(new URL("./lib/node-env.ts", import.meta.url)) }] },
  test: { include: ["tests/**/*.test.ts"] },
});
