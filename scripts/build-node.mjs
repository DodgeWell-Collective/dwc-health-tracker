// Builds the Node target. vinext refuses a non-Cloudflare build while
// cloudflare.config.ts exists, so it is set aside for the build and put back after.
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

const config = "cloudflare.config.ts";
const aside = `${config}.building`;
if (existsSync(aside) && !existsSync(config)) renameSync(aside, config); // left over from an interrupted build
const hadConfig = existsSync(config);
if (hadConfig) renameSync(config, aside);
try {
  execSync("vite build --mode node", { stdio: "inherit" });
} finally {
  if (hadConfig) renameSync(aside, config);
}
