// The gate runner names every gate there is (slice M2).
//
// The point of a runner is that "run the gates" stops being a thing anybody has
// to remember. That only holds while the sets are complete: a gate that exists
// and is in no set is a gate nobody runs, which is worse than not having it —
// it looks like coverage from the outside and is not.
//
// So this test walks `tools/` and asks the runner about every file that looks
// like a gate. It is the same shape as `test/reachability.test.js`: the fix
// when it goes red is to put the gate in a set or delete it, never to widen the
// allowlist.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { SETS, GATES, BUDGET_MS, gatesIn } from "../tools/gates.mjs";

/** Files under `tools/` that are gates by their name. */
function gateFiles() {
  return readdirSync(join(repoRoot, "tools"))
    .filter((n) => n.endsWith("_smoke.mjs") || n.endsWith("_gate.mjs") || n.endsWith("_soak.mjs"))
    .sort();
}

/** Everything the runner can run, whichever set names it. */
const named = () => new Set(Object.values(SETS).flat());

test("every gate file is in a set", () => {
  const missing = gateFiles()
    .map((n) => n.replace(/\.mjs$/, ""))
    .filter((n) => !named().has(n));
  assert.deepEqual(missing, [],
    `these exist under tools/ and no set runs them: ${missing.join(", ")}`);
});

test("every gate a set names is a file that exists", () => {
  // The other direction, and the one that rots: a gate renamed or deleted
  // leaves a set pointing at nothing, and the runner would skip it silently.
  const files = new Set(readdirSync(join(repoRoot, "tools")).map((n) => n.replace(/\.mjs$/, "")));
  const ghosts = [...named()].filter((n) => !files.has(n));
  assert.deepEqual(ghosts, [], `sets name gates that do not exist: ${ghosts.join(", ")}`);
});

test("`all` is every gate in every other set, and nothing else", () => {
  const others = new Set(Object.entries(SETS).filter(([k]) => k !== "all").flatMap(([, v]) => v));
  assert.deepEqual([...SETS.all].sort(), [...others].sort());
});

test("the sets a slice can be asked to run all exist", () => {
  // `.claude/skills/slice-workflow/SKILL.md` step 5 names these by name.
  for (const set of ["quick", "render", "sim", "all"]) {
    assert.ok(Array.isArray(SETS[set]), `there is no "${set}" set`);
    assert.ok(SETS[set].length > 0, `"${set}" is empty`);
  }
});

test("every set has a time budget, and it is a number of minutes", () => {
  // A runner with no budget is a list. The budget is what turns "this gate got
  // slower" from a fact of life into a finding.
  for (const set of Object.keys(SETS)) {
    assert.ok(BUDGET_MS[set] > 0, `"${set}" has no budget`);
    assert.ok(BUDGET_MS[set] < 3 * 60 * 60 * 1000, `"${set}" is budgeted at over three hours`);
  }
});

test("a gate knows how to be run: a command and a name", () => {
  for (const name of named()) {
    const gate = GATES[name];
    assert.ok(gate, `"${name}" is in a set with no entry in GATES`);
    assert.ok(Array.isArray(gate.args), `"${name}" has no argv`);
    assert.ok(gate.args[0].endsWith(".mjs"), `"${name}" does not run a script: ${gate.args[0]}`);
  }
});

test("asking for a set that does not exist is refused, not silently empty", () => {
  // The failure this prevents: `node tools/gates.mjs quik` printing "0 gates,
  // all green" and somebody believing it.
  assert.throws(() => gatesIn("quik"), /unknown gate set/i);
});

test("the browser smokes are all in `quick`", () => {
  // M2's own definition. A smoke that drives the real page is the cheapest
  // thing that can see a blank one (R2), so none of them belongs in a slow set.
  const smokes = gateFiles().filter((n) => n.endsWith("_smoke.mjs")).map((n) => n.replace(/\.mjs$/, ""));
  const quick = new Set(SETS.quick);
  const late = smokes.filter((n) => !quick.has(n));
  assert.deepEqual(late, [], `browser smokes outside "quick": ${late.join(", ")}`);
});

test("README names the runner rather than a list that drifts", () => {
  // The gate list in `README.md` did not name `walkthrough`, `passability`,
  // `lanes_dump` or `budget_gate`'s flags for the whole of the cityviewer lane.
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /tools\/gates\.mjs/, "the README does not mention the runner");
  for (const set of ["quick", "render", "sim"]) {
    assert.match(readme, new RegExp(`gates\\.mjs ${set}`), `the README does not name the "${set}" set`);
  }
});

// --- tools that are not gates (slice M4) -------------------------------------

test("a tool that is not a gate is not expected to be in a set", () => {
  // `i18n_review.mjs` writes a table for a person to read and writes their
  // edits back; `screenshot.mjs`, `serve.mjs` and `repin.mjs` are the same
  // shape. None of them passes or fails, so none belongs in a set — and the
  // naming convention above (`_smoke`, `_gate`, `_soak`) is what keeps that
  // distinction from being a matter of memory.
  for (const tool of ["i18n_review", "screenshot", "serve", "repin", "make_precache", "play_shot"]) {
    assert.equal(SETS.all.includes(tool), false, `${tool} is in a gate set`);
    assert.equal(/_(smoke|gate|soak)$/.test(tool), false,
      `${tool} is named like a gate but is not one`);
  }
});
