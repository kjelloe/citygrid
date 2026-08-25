// Ruling 004 — engine/ core is the restricted, Lua-portable subset.
//
// The bans are the classic cross-language port killers, and they double as a
// readability constraint on the rules themselves. This guard exists before
// engine/ does: it passes vacuously today and bites on the first line of 0.3.

import test from "node:test";
import assert from "node:assert/strict";
import { jsFilesIn, findViolations } from "./helpers/sources.js";

const engine = () => jsFilesIn("engine");

const BANS = [
  ["class declarations", /\bclass\s+[A-Za-z_$]/],
  ["`this`", /\bthis\b/],
  ["`new`", /\bnew\s+[A-Za-z_$]/],
  ["Map", /\bMap\s*\(/],
  ["Set", /\bSet\s*\(/],
  ["WeakMap/WeakSet", /\bWeak(Map|Set)\b/],
  ["throw", /\bthrow\b/],
  ["try/catch", /\btry\s*\{/],
  ["async", /\basync\b/],
  ["await", /\bawait\b/],
];

for (const [label, pattern] of BANS) {
  test(`engine/ is free of ${label} (ruling 004)`, () => {
    const hits = findViolations(engine(), pattern);
    assert.deepEqual(hits, [], `${label} is not allowed in engine/:\n  ${hits.join("\n  ")}`);
  });
}

test("engine/ divides through idiv(), never bare `/` on integers we care about", () => {
  // A bare `/` is legal JS but produces a float, and floats diverge across
  // languages. We cannot detect intent, so we require that any file using
  // division imports idiv — the reviewable half of the rule.
  const offenders = [];
  for (const file of jsFilesIn("engine")) {
    const usesDivision = /[^/*]\/[^/*=]/.test(file.source.replace(/\/\/.*$/gm, ""));
    const importsIdiv = /idiv/.test(file.source);
    if (usesDivision && !importsIdiv) offenders.push(file.path);
  }
  assert.deepEqual(offenders, [], `division without idiv in:\n  ${offenders.join("\n  ")}`);
});

test("the subset guard actually catches a planted violation", () => {
  const planted = [{ path: "engine/planted.js", source: "class Foo {}\nconst m = new Map();\n" }];
  assert.ok(findViolations(planted, /\bclass\s+[A-Za-z_$]/).length > 0);
  assert.ok(findViolations(planted, /\bMap\s*\(/).length > 0);
});
