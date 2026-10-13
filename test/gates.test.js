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
import { SETS, GATES, BUDGET_MS, gatesIn, devLogEntriesIn, otherPidsIn } from "../tools/gates.mjs";

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
  // S14's before/after pictures of a street's shoulder (Q145). It takes three
  // shots at a place `walkthrough 128 hilly` names and asserts nothing: the
  // question it serves is a picture decision, and the walk is what counts the
  // cliffs.
  // W6's measurement (and W3's): they print a table, not a pass. A tool that
  // produces numbers is run by the slice that reads them.
  "model_cost", "seam_cost", "crowd_probe"];

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

/**
 * Browser smokes that are deliberately NOT in `quick`, with what makes each one
 * too expensive for the set every slice runs.
 *
 * M2's rule is **split rather than raise**, and this is the other side of it: a
 * smoke that costs as much as a soak makes `quick` a set nobody runs after a
 * one-line change, which is worse than a set it is not in. The entry has to say
 * what the cost IS, because "it felt slow" is how a budget stops meaning
 * anything.
 */
const NOT_IN_QUICK = {
  room_smoke: "eight browsers against a real `ws` server and a room pumped for "
    + "city years — one of them a 390x844 phone since X7 — at 167 s. It was 81 s "
    + "of a 540 s budget when this excuse was written and `quick` measured 578 s "
    + "with it in (X5 item 2, M9). It IS `room` since X8 split that set: the two "
    + "scripted soaks are `wire` now, and this gate is the room as a page.",
};

/** The three sets a browser smoke may be in since M14 — `quick` for the ones
 * that ask whether the game boots and keeps a city, `screens` for the two that
 * drive the interface, `access` for the two that audit it. The rule below is
 * the same rule: a smoke belongs in one of the cheap sets unless it costs a
 * soak, and the split did not change what a smoke costs. */
const SMOKE_SETS = ["quick", "screens", "access"];

test("every browser smoke is in a cheap set, except the ones that cost a soak", () => {
  // M2's own definition. A smoke that drives the real page is the cheapest
  // thing that can see a blank one (R2), so none of them belongs in a slow set
  // — until one of them is not cheap.
  const smokes = gateFiles().filter((n) => n.endsWith("_smoke.mjs")).map((n) => n.replace(/\.mjs$/, ""));
  const cheap = new Set(SMOKE_SETS.flatMap((set) => SETS[set]));
  const late = smokes.filter((n) => !cheap.has(n) && !Object.hasOwn(NOT_IN_QUICK, n));
  assert.deepEqual(late, [],
    `browser smokes outside ${SMOKE_SETS.join("/")}: ${late.join(", ")}`);
});

test("a smoke excused from the cheap sets is in some other set, and says why", () => {
  // The two ways this list could lie: an excuse for a gate that is now in one
  // of them after all, and an excuse that took a gate out of every set — which
  // is the thing "every gate file is in a set" exists to prevent.
  for (const [name, why] of Object.entries(NOT_IN_QUICK)) {
    for (const set of SMOKE_SETS) {
      assert.equal(SETS[set].includes(name), false, `${name} is excused and is in "${set}"`);
    }
    assert.ok(named().has(name), `${name} is excused from the cheap sets and no set runs it`);
    assert.ok(why.length > 40, `${name} is excused without saying what it costs`);
  }
});

test("the three cheap sets are disjoint, and none of them is empty", () => {
  // A gate in two sets pays for itself twice in `all` and reports two rows;
  // an empty set is a name in the runner that answers no question (M14).
  const seen = new Map();
  for (const set of SMOKE_SETS) {
    assert.ok(SETS[set].length > 0, `"${set}" has no gates in it`);
    for (const gate of SETS[set]) {
      assert.equal(seen.get(gate), undefined, `${gate} is in "${set}" and "${seen.get(gate)}"`);
      seen.set(gate, set);
    }
  }
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
  // edits back; `screenshot.mjs` and `repin.mjs` are the same
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

// --- the commit discipline, as a check (X5 item 4) ---------------------------

test("the runner counts dev-log entries the tree has and HEAD does not", () => {
  // The reading itself cannot be checked by eye — nobody is going to count
  // fourteen headings in a diff — so the counting is checked here instead. The
  // three things it must not count are the file header, a heading the diff only
  // carries as context, and a heading that was REMOVED.
  const diff = [
    "diff --git a/dev-log.md b/dev-log.md",
    "--- a/dev-log.md",
    "+++ b/dev-log.md",
    "@@ -11,6 +11,20 @@",
    " ## X4e — watching without playing (2026-10-08)",
    "+## X5 — the review fixes after X4e (2026-10-08)",
    "+",
    "+Suite green twice.",
    "+## S18c — the wall at two metres",
    "-## a heading somebody deleted",
  ].join("\n");
  assert.equal(devLogEntriesIn(diff), 2);
  assert.equal(devLogEntriesIn(""), 0);
});

// --- a gate run is exclusive (M9, S22) ---------------------------------------

test("the runner counts the node processes that are not itself", () => {
  // Three reds in one day were contention and all three were green alone, so
  // the runner says `NOT ALONE` before it starts. Its first cut used
  // `pgrep -f "node tools/"`, which matches the whole COMMAND LINE and so
  // matched the shell that had been asked to run `node tools/gates.mjs` — every
  // run warned about itself, and an instrument that cries wolf is worse than
  // none. It matches the process NAME now, and this is the arithmetic either
  // way: everything but me.
  assert.deepEqual(otherPidsIn("1234\n5678\n", 1234), [5678]);
  assert.deepEqual(otherPidsIn("1234\n", 1234), [], "a run alone counted itself");
  assert.deepEqual(otherPidsIn("", 1234), []);
  // `pgrep` exits 1 with no output when nothing matches, and the caller turns
  // that into zero — but a trailing newline is the normal case and must not
  // become a NaN in the list.
  assert.deepEqual(otherPidsIn("4321\n9999\n", 1234), [4321, 9999]);
});

test("every set has a budget, and no gate is in two of them", () => {
  // Two cheap invariants that have each been true by habit and never asserted —
  // and X8 added the sixteenth set, which is the moment habit runs out. A set
  // with no budget divides by `undefined` and prints `NaN min`; a gate in two
  // sets pays for itself twice in `all` and reports two rows.
  const names = Object.keys(SETS).filter((name) => name !== "all");
  assert.ok(names.length >= 10, `${names.length} sets is not this runner`);
  for (const name of names) {
    assert.equal(typeof BUDGET_MS[name], "number", `"${name}" has no budget`);
    assert.ok(BUDGET_MS[name] > 0, `"${name}" has a budget of ${BUDGET_MS[name]}`);
  }
  const owner = new Map();
  for (const name of names) {
    for (const gate of SETS[name]) {
      assert.equal(owner.get(gate), undefined,
        `${gate} is in "${name}" and in "${owner.get(gate)}"`);
      owner.set(gate, name);
    }
  }
  // And `all` is exactly the union, which is what makes one run of it a run of
  // everything.
  assert.deepEqual([...SETS.all].sort(), [...owner.keys()].sort());
});
