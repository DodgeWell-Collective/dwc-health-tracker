import { existsSync, readFileSync } from "node:fs";
import { bindings, defineConfig, defineWorker } from "cf/config";

// Your own deployment's details (Worker name, custom domain, an existing database,
// sign-in by Cloudflare Access) go in cloudflare.local.json, which git ignores.
// Copy cloudflare.local.example.json to start. Without it, the defaults below apply.
type Local = {
  name?: string;
  domains?: string[];
  databaseId?: string;
  /** "access": Cloudflare Access signs you in, and the app checks its token (needs `access`). "off": no checks. */
  appAuth?: "access" | "off";
  /** Your Zero Trust team name and the Access application's AUD tag. */
  access?: { team: string; aud: string };
};
const local: Local = existsSync("cloudflare.local.json") ? JSON.parse(readFileSync("cloudflare.local.json", "utf8")) : {};
const name = local.name ?? "dwc-health-tracker";

export default defineConfig({
  worker: defineWorker({
    name,
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-17",
    compatibilityFlags: ["nodejs_compat"],
    // Served at <name>.<your-subdomain>.workers.dev, unless cloudflare.local.json lists your own domains.
    ...(local.domains?.length ? { domains: local.domains, workersDev: false } : { workersDev: true }),
    previewUrls: false,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Secrets aren't declared here: a declared secret is required, which would fail the first
      // deploy before you've had a chance to set it. Set them after deploying, with
      // `npx wrangler secret put <NAME> --name <worker name>` or in the dashboard
      // (Worker → Settings → Variables and Secrets):
      //   APP_PASSWORD       the first sign-in password; the app stays locked until it is set
      //   ANTHROPIC_API_KEY  optional, or enter it in Settings: Claude features
      //   USDA_API_KEY       optional, or enter it in Settings: higher USDA search limits
      // Sign-in by Cloudflare Access instead of the app's password.
      ...(local.appAuth ? { APP_AUTH: bindings.text(local.appAuth) } : {}),
      ...(local.appAuth === "access" && local.access
        ? { ACCESS_TEAM: bindings.text(local.access.team), ACCESS_AUD: bindings.text(local.access.aud) }
        : {}),
      // Created on first deploy, unless cloudflare.local.json names an existing database.
      DB: local.databaseId ? bindings.d1({ id: local.databaseId }) : bindings.d1({ name }),
    },
  }),
});
