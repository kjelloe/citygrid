// Purity of engine/ and shared/ — CLAUDE.md non-negotiables 1-3.
//
// Determinism is the whole ballgame: saves, replays, multiplayer, the desync
// detector and the AI soak all rest on `state + commands -> identical state`.
// Every ban here is one way that guarantee has been lost in a sibling project.

import test from "node:test";
import assert from "node:assert/strict";
import { jsFilesIn, findViolations, repoRoot } from "./helpers/sources.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const pure = () => [...jsFilesIn("engine"), ...jsFilesIn("shared")];

const BANS = [
  ["Math.random", /\bMath\s*\.\s*random\b/],
  ["Date.now", /\bDate\s*\.\s*now\b/],
  ["new Date", /\bnew\s+Date\b/],
  ["performance.now", /\bperformance\s*\.\s*now\b/],
  ["setTimeout/setInterval", /\bset(Timeout|Interval)\b/],
  ["fetch", /\bfetch\s*\(/],
  ["DOM access", /\b(document|window|localStorage|indexedDB)\b/],
];

for (const [label, pattern] of BANS) {
  test(`engine/ and shared/ are free of ${label}`, () => {
    const hits = findViolations(pure(), pattern);
    assert.deepEqual(hits, [], `${label} breaks determinism:\n  ${hits.join("\n  ")}`);
  });
}

test("engine/ contains no null literals", () => {
  // The ban is on null *in state*: JSON null becomes nil in Lua and vanishes
  // from tables, which is the nastiest cross-language trap there is.
  // shared/ is exempt because shared/statehash.js has to name null in order to
  // reject it.
  const hits = findViolations(jsFilesIn("engine"), /\bnull\b/);
  assert.deepEqual(hits, [], `null is not allowed in engine/:\n  ${hits.join("\n  ")}`);
});

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

// --- the other direction (cityviewer: rulings 032, 037, 040) ----------------
//
// `engine/` may not reach outward, and that has been checked since slice 0.
// The reverse was a habit rather than a rule: the viewer must not reach into
// `engine/` either, because the moment it does, a renderer detail is a
// simulation input and the two can no longer be reasoned about apart. The
// handful of constants the viewer needs are mirrored in
// `client/constants-mirror.js`, which `test/render.test.js` keeps honest.

test("the viewer never imports the engine", () => {
  const offenders = [];
  for (const dir of ["client/world", "client/render", "client/life"]) {
    const root = join(repoRoot, dir);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!name.endsWith(".js")) continue;
      const source = readFileSync(join(root, name), "utf8");
      for (const line of source.split("\n")) {
        if (!/^\s*import\s/.test(line) && !/\bimport\(/.test(line)) continue;
        if (/["'][^"']*\/engine\//.test(line) || /["']\.\.\/\.\.\/engine\//.test(line)) {
          offenders.push(`${dir}/${name}: ${line.trim()}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    `the viewer must read state, not the rules that produce it:\n  ${offenders.join("\n  ")}`);
});

test("client/world stays pure: no three, no DOM, no clock", () => {
  // The model is derived and re-derivable (ruling 032). A model that reached
  // for `performance.now` or a canvas would be a model whose value depended on
  // when it was built, and every fixture assertion in test/world.test.js would
  // be measuring the machine.
  const banned = [/from "three"/, /\bdocument\b/, /\bwindow\b/, /performance\.now/, /Date\.now/, /Math\.random/];
  const offenders = [];
  for (const name of readdirSync(join(repoRoot, "client", "world"))) {
    if (!name.endsWith(".js")) continue;
    const source = readFileSync(join(repoRoot, "client", "world", name), "utf8");
    for (const pattern of banned) {
      if (pattern.test(source)) offenders.push(`client/world/${name}: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});

test("client/life keeps its own clock and never asks the machine for one", () => {
  // Traffic is renderer-local state (ruling 037) and therefore the one part of
  // cityviewer that remembers something between frames. It is still
  // deterministic: time enters as the delta the caller passes in, which is what
  // makes `?life=0` freeze it and two screenshots identical.
  const source = readFileSync(join(repoRoot, "client", "life", "traffic.js"), "utf8");
  for (const pattern of [/Math\.random/, /performance\.now/, /Date\.now/, /from "three"/]) {
    assert.equal(pattern.test(source), false, `client/life/traffic.js uses ${pattern}`);
  }
});

test("the quality tier never reaches a command (ruling 040)", () => {
  // A tier that changed the simulation would be hashed state, and two players
  // on different tiers would desync on the first month tick.
  const sources = [];
  for (const dir of ["engine", "shared", "worker", "server"]) {
    const root = join(repoRoot, dir);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (name.endsWith(".js")) sources.push([`${dir}/${name}`, readFileSync(join(root, name), "utf8")]);
    }
  }
  // Names that can only mean rendering. NOT the bare word "tier": a building's
  // `valueTier` is a game concept and has been since Wave 1, and a test that
  // matches a word rather than a thing fails on the wrong file.
  const banned = /carCap|pedCap|pixelRatio|triangleBudget|shadowMap|antialias|streetChunks|frameMs/;
  const offenders = sources.filter(([, source]) => banned.test(source));
  assert.deepEqual(offenders.map(([n]) => n), [],
    "a rendering preference reached the simulation");

  // And the other half of the promise: the tier is a stored PREFERENCE, so it
  // must not be in the options record either (that is hashed).
  const options = readFileSync(join(repoRoot, "engine", "options.js"), "utf8");
  assert.equal(/quality/.test(options), false, "the quality tier is a game option");
});
