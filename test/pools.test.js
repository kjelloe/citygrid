// Every pool a life module poses into exists (the omissions round, 2026-10-06).
//
// S17 split the boats by shape and `client/life/boats.js` started posing into
// `pools.moored` and `pools.cargo` — with `?? pools.boat` behind them, so a
// renderer that has not made those pools still draws something. That fallback
// is right, and it is also exactly what hides a TYPO: `pools.morred` would fall
// back for ever and the moored boats would quietly keep their full sail.
//
// So the names are checked against the pools `instances.js` actually makes.
// `instances.js` imports three and node cannot load it; the names are a flat
// list of `make("…")` calls, which is the half a source scan can hold (the same
// arrangement `test/facade-spec.test.js` uses for the bake).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, jsFilesIn, stripButKeepInterpolations } from "./helpers/sources.js";

/** The pools `createInstances` makes, by name. */
function poolsMade() {
  const source = readFileSync(join(repoRoot, "client", "render", "instances.js"), "utf8");
  const names = new Set();
  for (const m of source.matchAll(/\bmake\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) names.add(m[1]);
  // The per-variant families are made in loops, from a count: `car0`, `tree2_low`.
  for (const m of source.matchAll(/\bmake\(\s*`([A-Za-z0-9_]+)\$\{/g)) names.add(m[1]);
  return names;
}

test("every pool a life module poses into is a pool the renderer makes", () => {
  const made = poolsMade();
  assert.ok(made.size > 20, `only ${made.size} pools found — the scan, not the renderer`);
  const missing = [];
  for (const file of jsFilesIn("client/life")) {
    const code = stripButKeepInterpolations(file.source);
    for (const m of code.matchAll(/\bpools\.([A-Za-z0-9_]+)/g)) {
      const name = m[1];
      // `pools.car0`-style families are matched by their prefix.
      if (made.has(name)) continue;
      if ([...made].some((pool) => name.startsWith(pool))) continue;
      missing.push(`${file.path}: pools.${name}`);
    }
  }
  assert.deepEqual([...new Set(missing)].sort(), [],
    "a life module poses into a pool nothing makes — with a `??` fallback behind it, that is a typo "
    + "that draws the wrong shape for ever");
});
