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
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { SETS, GATES, BUDGET_MS, gatesIn } from "../tools/gates.mjs";

/**
 * Tools that are NOT gates: they produce something for a person to read or look
 * at and have no criterion to fail on. Named here once, because two tests ask
 * about them — "every gate file is in a set" has to skip them, and "a tool that
 * is not a gate is not expected to be in a set" has to prove they really cannot
 * fail (P94).
 */
const NOT_A_GATE = ["i18n_review", "screenshot", "serve", "repin", "make_precache", "play_shot",
  "perf_card", "perf_report", "compare_sheet", "crowd_shots", "house_shots", "traffic_shots",
  // G1's evidence (ruling 046): it photographs a state the engine can no longer
  // produce, so it is run against a worktree of an older commit and can never
  // fail here.
  "street_proof",
  // J3's hilly walk: defined so it can be run by name, deliberately in no set
  // (Q142) — its criteria are absolute and the hilly city moves with every
  // balance era.
  "walkthrough_hilly"];

/** Files under `tools/` that are gates by their name.
 *
 * `_shots` is in the list since P94. P75's whole finding was that the picture
 * tools — which COUNT what they photographed and exit non-zero — were run by
 * hand in the slice that wrote them and never again; they were put into sets by
 * hand, and this check could not see them, so `civic_shots` was outside every
 * set for three slices while it quietly reported `invalid` for every 1×1
 * definition. A tool that can fail belongs to a set by name, not by memory. */
function gateFiles() {
  return readdirSync(join(repoRoot, "tools"))
    .filter((n) => n.endsWith("_smoke.mjs") || n.endsWith("_gate.mjs") || n.endsWith("_soak.mjs")
      || n.endsWith("_shots.mjs"))
    .filter((n) => !NOT_A_GATE.includes(n.replace(/\.mjs$/, "")))
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

test("every gate a set names runs a file that exists", () => {
  // The other direction, and the one that rots: a gate renamed or deleted
  // leaves a set pointing at nothing, and the runner would skip it silently.
  //
  // Through GATES rather than through the filenames: a gate's NAME is not its
  // file, because one tool can be two gates with different arguments —
  // `walkthrough` and `walkthrough_hilly` are the same walk on two terrains
  // (J3), and the hilly one is the measurement S11 and J3 exist for. What must
  // exist is the script each entry actually runs.
  const ghosts = [...named()].filter((name) => !Object.hasOwn(GATES, name));
  assert.deepEqual(ghosts, [], `sets name gates GATES does not define: ${ghosts.join(", ")}`);
  for (const [name, gate] of Object.entries(GATES)) {
    const script = gate.args[0];
    assert.ok(existsSync(join(repoRoot, script)), `${name} runs ${script}, which does not exist`);
  }
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
  //
  // The measurement lane added three more of the same shape: `perf_card.mjs`
  // produces numbers, `perf_report.mjs` a table of them, and `compare_sheet.mjs`
  // a picture judged by eye. A measurement is not a pass, and a gate set that
  // ran them would take twenty minutes to tell you nothing (D1, D2, D4).
  // `crowd_shots` and `house_shots` are the same shape in the picture lane:
  // they take a frame for a person to look at and have no criterion to fail on,
  // which is why they are named `_shots` and still are not gates. The four that
  // DO exit non-zero are in `kits` (P94).
  for (const tool of NOT_A_GATE) {
    assert.equal(SETS.all.includes(tool), false, `${tool} is in a gate set`);
    assert.equal(/_(smoke|gate|soak)$/.test(tool), false,
      `${tool} is named like a gate but is not one`);
    // ...and a `_shots` tool that is not in a set must have no way to fail,
    // which is the thing that makes it a picture rather than a gate.
    if (tool.endsWith("_shots")) {
      const source = readFileSync(join(repoRoot, "tools", `${tool}.mjs`), "utf8");
      assert.equal(/process\.exit\(1\)/.test(source), false,
        `${tool} can fail and no set runs it`);
    }
  }
});
