// Purity of engine/ and shared/ — CLAUDE.md non-negotiables 1-3.
//
// Determinism is the whole ballgame: saves, replays, multiplayer, the desync
// detector and the AI soak all rest on `state + commands -> identical state`.
// Every ban here is one way that guarantee has been lost in a sibling project.

import test from "node:test";
import assert from "node:assert/strict";
import { jsFilesIn, findViolations } from "./helpers/sources.js";

const pure = () => [...jsFilesIn("engine"), ...jsFilesIn("shared")];

const BANS = [
  ["Math.random", /\bMath\s*\.\s*random\b/],
  ["Date.now", /\bDate\s*\.\s*now\b/],
  ["new Date", /\bnew\s+Date\b/],
  ["performance.now", /\bperformance\s*\.\s*now\b/],
  ["setTimeout/setInterval", /\bset(Timeout|Interval)\b/],
  ["null literals in state", /\bnull\b/],
  ["fetch", /\bfetch\s*\(/],
  ["DOM access", /\b(document|window|localStorage|indexedDB)\b/],
];

for (const [label, pattern] of BANS) {
  test(`engine/ and shared/ are free of ${label}`, () => {
    const hits = findViolations(pure(), pattern);
    assert.deepEqual(hits, [], `${label} breaks determinism:\n  ${hits.join("\n  ")}`);
  });
}

test("engine/ and shared/ contain no float literals", () => {
  // Integer state only; fixed point at FP = 256 where fractions are needed.
  // Floats drift across languages and across machines.
  const hits = findViolations(pure(), /(?<![\w.])\d+\.\d+(?![\w.])/);
  assert.deepEqual(hits, [], `float literals are not allowed:\n  ${hits.join("\n  ")}`);
});

test("engine/ imports nothing outside engine/ and shared/", () => {
  const offenders = [];
  for (const file of jsFilesIn("engine")) {
    for (const match of file.source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = match[1];
      const local = spec.startsWith(".");
      const allowed = local && !/\.\.\/(client|server|worker|vendor|tools)\//.test(spec);
      if (!allowed) offenders.push(`${file.path} -> ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], `engine/ must not depend on adapters:\n  ${offenders.join("\n  ")}`);
});

test("the purity guard actually catches a planted violation", () => {
  const planted = [{
    path: "engine/planted.js",
    source: "const r = Math.random();\nconst t = Date.now();\nconst f = 0.5;\n",
  }];
  assert.ok(findViolations(planted, /\bMath\s*\.\s*random\b/).length > 0);
  assert.ok(findViolations(planted, /\bDate\s*\.\s*now\b/).length > 0);
  assert.ok(findViolations(planted, /(?<![\w.])\d+\.\d+(?![\w.])/).length > 0);
});

test("banned words in comments and strings do not trip the guard", () => {
  const benign = [{
    path: "engine/benign.js",
    source: '// Math.random is banned here\nconst msg = "Date.now";\nconst n = 1;\n',
  }];
  assert.deepEqual(findViolations(benign, /\bMath\s*\.\s*random\b/), []);
  assert.deepEqual(findViolations(benign, /\bDate\s*\.\s*now\b/), []);
});
