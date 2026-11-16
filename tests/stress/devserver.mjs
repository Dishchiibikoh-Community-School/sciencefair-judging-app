// Starts the REAL app on http://localhost:5199 pointed at the STAGING project, for the
// browser-based tests (network trouble, devices, conflicts, sleep/wake, results accuracy).
//
//   node tests/stress/devserver.mjs          (leave running; Ctrl-C to stop)
//
// Isolation, which matters more here than anywhere else:
//   * The staging URL and key are injected as process env vars. NO file is written - in
//     particular no .env / .env.local, so nothing is left behind that could point a later
//     dev server or build at the wrong database.
//   * This machine has no .env at all, so if the injection ever failed the app would log
//     "Missing env vars" and talk to nothing. It cannot silently fall back to production.
//   * env.mjs is imported first, so its production guard validates the URL before the
//     server starts, and its FORBIDDEN list is re-checked below against what is injected.
//
// It also excludes scripts/ and graphify-out/ from the file watcher: a test writing a CSV
// into a watched folder has crashed this dev server with EBUSY on this machine before.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { cfg, FORBIDDEN } from "./env.mjs";

const c = cfg();
const REPO = fileURLToPath(new URL("../../", import.meta.url));

// Belt and braces: re-check the exact strings about to be handed to the browser.
for (const bad of FORBIDDEN) {
  if (c.url.includes(bad) || c.key.includes(bad)) {
    throw new Error(`REFUSED: the dev server was about to serve production credentials (${bad}).`);
  }
}

process.env.VITE_SUPABASE_URL = c.url;
process.env.VITE_SUPABASE_ANON_KEY = c.key;

const server = await createServer({
  root: REPO,
  configFile: `${REPO}vite.config.js`,
  server: {
    port: 5199,
    strictPort: true,
    watch: { ignored: ["**/scripts/**", "**/graphify-out/**", "**/tests/**"] },
  },
});
await server.listen();

console.log("═".repeat(72));
console.log("  DEV SERVER for stress testing");
console.log(`  URL             : http://localhost:5199/s/stress-test-fair`);
console.log(`  TALKING TO      : ${c.url}   (staging, ref ${c.ref})`);
console.log(`  PRODUCTION      : https://evrupqnhgrfltfhafeyj.supabase.co  — NOT SERVED`);
console.log(`  env files       : none written (credentials injected in-process only)`);
console.log("═".repeat(72));
