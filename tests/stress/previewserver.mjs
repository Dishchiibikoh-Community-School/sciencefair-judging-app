// Builds the app EXACTLY as it is deployed and serves it on :5200, pointed at STAGING.
//
//   node tests/stress/previewserver.mjs      (leave running; Ctrl-C to stop)
//
// Why this exists: the dev server ships hundreds of unbundled ES modules, so any load-time
// measured against it is meaningless. Device and load-time numbers must come from the real
// production bundle, which is what this serves.
//
// Same isolation rules as devserver.mjs: credentials are injected in-process, no .env file is
// written, and the production guard in env.mjs validates the URL before the build starts.
import { build, preview } from "vite";
import { fileURLToPath } from "node:url";
import { cfg, FORBIDDEN } from "./env.mjs";

const c = cfg();
const REPO = fileURLToPath(new URL("../../", import.meta.url));
for (const bad of FORBIDDEN) {
  if (c.url.includes(bad) || c.key.includes(bad)) throw new Error(`REFUSED: about to build with production credentials (${bad}).`);
}
process.env.VITE_SUPABASE_URL = c.url;
process.env.VITE_SUPABASE_ANON_KEY = c.key;

console.log("Building the production bundle against staging...");
await build({ root: REPO, configFile: `${REPO}vite.config.js`, logLevel: "warn" });

const server = await preview({
  root: REPO, configFile: `${REPO}vite.config.js`,
  preview: { port: 5200, strictPort: true },
});
console.log("═".repeat(72));
console.log("  PRODUCTION BUILD served for stress testing");
console.log(`  URL        : http://localhost:5200/s/stress-test-fair`);
console.log(`  TALKING TO : ${c.url}   (staging, ref ${c.ref})`);
console.log("═".repeat(72));
