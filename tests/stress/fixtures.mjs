// Pulls the REAL rubric presets and category defaults straight out of the app source, so the
// fake fair is scored with exactly the forms the live fair uses.
//
// Why extract instead of hand-copying: migration 2026-11a makes submit_score() validate every
// criterion id and value against that project's rubric steps. A hand-written approximation
// would be rejected by the server, and the stress test would be measuring rejections rather
// than scoring. Reading the source also means these fixtures cannot drift from the app.
//
// Reads only. Changes nothing in src/.
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../../src/ScienceFairJudging.jsx", import.meta.url), "utf8");
const LINES = SRC.split(/\r?\n/);

// Slice `const NAME = [ ... ];` — from its declaration line to the next `];` at column 0.
function block(name) {
  const start = LINES.findIndex((l) => l.startsWith(`const ${name} `));
  if (start < 0) throw new Error(`fixtures: const ${name} not found in ScienceFairJudging.jsx`);
  // A one-line declaration (`const X = [...];`) ends on its own line — without this the
  // scan runs on to the NEXT block's closing bracket and swallows it whole.
  if (/\];\s*$/.test(LINES[start])) return LINES[start];
  let end = start + 1;
  while (end < LINES.length && !/^\];/.test(LINES[end])) end++;
  if (end >= LINES.length) throw new Error(`fixtures: could not find the end of ${name}`);
  return LINES.slice(start, end + 1).join("\n");
}

// Evaluated together so the preset bodies can reference the constants they depend on.
const source = [block("DEFAULT_RUBRIC"), block("RATING_5"), block("RUBRIC_PRESETS"), block("DEFAULT_CATEGORIES")].join("\n\n")
  + "\n;return { DEFAULT_RUBRIC, RUBRIC_PRESETS, DEFAULT_CATEGORIES };";

const mod = new Function(source)();

export const DEFAULT_CATEGORIES = mod.DEFAULT_CATEGORIES;

// { id -> resolved criteria array }, the `criteria()` thunks already called.
export const PRESETS = Object.fromEntries(
  mod.RUBRIC_PRESETS.map((p) => [p.id, { id: p.id, label: p.label, criteria: p.criteria(), settings: p.settings || {} }])
);

// One valid value for a criterion — `pick` 0..1 chooses low..high among its real steps.
export function stepValue(crit, pick) {
  const steps = crit.steps || [];
  if (!steps.length) return crit.max;
  return steps[Math.min(steps.length - 1, Math.max(0, Math.round(pick * (steps.length - 1))))];
}

// A complete, server-valid criteria object for one rubric.
export function criteriaFor(criteria, pick) {
  return Object.fromEntries(criteria.map((cr, i) => [cr.id, stepValue(cr, pick + ((i % 3) - 1) * 0.12)]));
}
