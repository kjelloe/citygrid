// The fixtures, and the second copy of the hashed-field list.
//
// Slice 0.4's gate is "`test/fixtures/empty.json` passes". It has been marked
// done since Wave 0 and `test/fixtures/` was an empty directory until slice
// N17 — so for the life of the project the tripwire `CLAUDE.md` calls the
// determinism machinery did not exist, and four slices added hashed state with
// nothing watching (the P22 audit).
//
// Two jobs here:
//
//   1. Replay every fixture and check every step's hash, result and events.
//   2. Hold the **second** copy of the list of hashed fields, so that adding
//      one is the deliberate two-file act `CLAUDE.md` describes. It described
//      one file for the life of the project; this is the other.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { loadSystems, readFixture, fixtureNames, replay } from "../tools/fixtures.mjs";

await loadSystems();

// --- 1. the fixtures --------------------------------------------------------

const names = await fixtureNames();

test("there are fixtures at all", () => {
  // The check that would have failed for a year. `plan-v1.md` names
  // `empty.json` as slice 0.4's gate.
  assert.ok(names.includes("empty.json"), `no empty.json; found ${names.join(", ") || "nothing"}`);
  assert.ok(names.length >= 3, `only ${names.length} fixtures`);
});

for (const name of names) {
  const fixture = await readFixture(name);
  test(`fixture ${name}: every step's hash, result and events`, () => {
    const verdict = replay(fixture);
    assert.deepEqual(verdict.problems, [], `\n  ${verdict.problems.join("\n  ")}`);
  });
}

test("every fixture says why it exists and which era it belongs to", () => {
  // A number without an era is void, not roughly comparable (CLAUDE.md), and a
  // fixture whose reason says "fix tests" is one nobody will trust later.
  for (const name of names) {
    const fixture = JSON.parse(readFileSync(join(repoRoot, "test", "fixtures", name), "utf8"));
    assert.ok((fixture.why ?? "").length > 30, `${name}: no real reason recorded`);
    assert.ok(Number.isInteger(fixture.era), `${name}: no era`);
    assert.ok(fixture.steps.every((s) => typeof s.hash === "string"),
      `${name}: a step has no pinned hash`);
  }
});

test("replaying a fixture twice gives the same answer", () => {
  // The fixtures are the determinism gate, so the gate itself has to be
  // deterministic. A fixture that passed on the second run and not the first
  // would be measuring module load order.
  const fixture = JSON.parse(readFileSync(join(repoRoot, "test", "fixtures", "founding.json"), "utf8"));
  const first = replay(fixture);
  const second = replay(fixture);
  assert.deepEqual(first.steps.map((s) => s.hash), second.steps.map((s) => s.hash));
});

// --- 2. the second copy -----------------------------------------------------

/**
 * Every top-level field of `state` that `writeState()` hashes.
 *
 * **This is the second of the two places `CLAUDE.md` requires.** Adding a field
 * to the hash without adding it here is a red suite, which is the entire point:
 * a hash change must be a conscious act in two files rather than a line
 * somebody slipped into a serialiser.
 *
 * Tile layers are not listed — `hashState` walks `TILE_LAYERS`, which is its
 * own declaration and has its own test.
 */
const HASHED_FIELDS = [
  "buildings",
  "contracts",
  "demand",
  "disaster",
  "height",
  "history",
  "jobs",
  "nextId",
  "options",
  "players",
  "population",
  "quests",
  "requests",
  "rng",
  "scanCursor",
  "tax",
  "tick",
  "traffic",
  "treasury",
  "width",
];

/** The body of `writeState`, by brace matching. Crude and adequate: it is one
 * function in one file, and the alternative is a parser. */
function writeStateBody() {
  const source = readFileSync(join(repoRoot, "engine", "state.js"), "utf8");
  const start = source.indexOf("export function writeState(sink, state) {");
  assert.notEqual(start, -1, "writeState has been renamed; this test is now blind");
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  throw new Error("writeState's braces do not balance");
}

test("the two lists of hashed fields agree", () => {
  const body = writeStateBody();
  const found = [...new Set([...body.matchAll(/\bstate\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))].sort();
  const added = found.filter((f) => !HASHED_FIELDS.includes(f));
  const removed = HASHED_FIELDS.filter((f) => !found.includes(f));
  assert.deepEqual(added, [],
    `writeState hashes ${added.join(", ")} and this list does not. `
    + "If that is deliberate, add it here AND re-pin the fixtures through /fixture-repin.");
  assert.deepEqual(removed, [],
    `this list names ${removed.join(", ")} and writeState no longer hashes it.`);
});

test("the hashed fields are all present on a real state", () => {
  // A typo in the list above would otherwise be invisible: the source scan
  // would find `state.tick` and the list would say `state.tik`, and the
  // previous test would catch it — but only if the scan is right. This checks
  // the list against reality rather than against the scan.
  const verdict = replay(JSON.parse(readFileSync(join(repoRoot, "test", "fixtures", "empty.json"), "utf8")));
  for (const field of HASHED_FIELDS) {
    assert.notEqual(verdict.state[field], undefined, `state has no ${field}`);
  }
});
