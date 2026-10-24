import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

// `--mode node` builds a plain Node server with a SQLite file (lib/node-env.ts);
// any other mode targets Cloudflare Workers with D1.
export default defineConfig(({ mode }) => {
  const node = mode === "node";
  return {
    resolve: {
      // Keep paths as written: on a mapped network drive, resolved realpaths become
      // UNC paths that the workerd module runner can't load.
      preserveSymlinks: true,
      alias: node ? [{ find: "cloudflare:workers", replacement: fileURLToPath(new URL("./lib/node-env.ts", import.meta.url)) }] : [],
    },
    plugins: [
      vinext(),
      !node &&
        cloudflare({
          viteEnvironment: {
            name: "rsc",
            childEnvironments: ["ssr"],
          },
        }),
    ],
  };
});
