// An arm that measures nothing (D11's round, 2026-10-13).
//
// `region_sweep`'s `split-equal` arm was the NULL arm with another name: A142
// made "a split treasury divided equally" the default, and `defaultOptions`
// reads anything that is not `separate` as a split and anything that is not
// `population` as equal — so `{ treasury: "split", splitRule: "equal" }` is the
// default spelled out. Both arms returned 3,905 residents and §6,181,849 on
// demanding-64, byte for byte, and **the only thing that caught it was a
// 50-minute run at 200 games**.
//
// This is the same question asked of the TABLE, in a millisecond: resolve every
// arm's options the way the engine will and compare them. A sweep's arms must
// differ from the null arm and from each other, or the report has a column that
// says nothing and a reader who believes it.

import test from "node:test";
import assert from "node:assert/strict";
import { ARMS, CONFIGS } from "../tools/region_sweep.mjs";
import { defaultOptions } from "../engine/options.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

/** What the engine will actually play, for one arm. */
function resolved(arm) {
  const options = defaultOptions({ seed: 1, width: 64, height: 64, seats: 4, ...arm.options });
  // The fields the sweep's arms are about. `seed` and the rest are the same in
  // every arm by construction and would hide a difference that is not one.
  return JSON.stringify({
    treasury: options.treasury,
    splitRule: options.splitRule,
    mutualAid: options.mutualAid,
    disasterAid: options.disasterAid,
  });
}

test("no arm resolves to the same options as another", () => {
  const seen = new Map();
  for (const arm of ARMS) {
    const key = resolved(arm);
    const twin = seen.get(key);
    assert.equal(twin, undefined,
      `"${arm.name}" and "${twin}" are the same configuration: ${key}`);
    seen.set(key, arm.name);
  }
  assert.ok(ARMS.length >= 3, `${ARMS.length} arms is not a sweep`);
});

test("the null arm is the defaults, and every other arm moves exactly one thing", () => {
  // `one-deputy-turn-moves-the-sweep`: two rules changed together measure their
  // sum and nothing else. The null arm is the baseline, so it has to BE the
  // defaults — an arm list whose first entry carries options is a sweep with no
  // baseline at all.
  const [nullArm, ...rest] = ARMS;
  assert.equal(nullArm.name, "null", "the first arm is the baseline and is called null");
  assert.deepEqual(nullArm.options, {}, "the null arm carries options");
  const base = JSON.parse(resolved(nullArm));
  for (const arm of rest) {
    const moved = Object.entries(JSON.parse(resolved(arm)))
      .filter(([field, value]) => base[field] !== value)
      .map(([field]) => field);
    assert.ok(moved.length >= 1, `"${arm.name}" moves nothing`);
    // `treasury: separate` moves the split rule's MEANING as well as the
    // treasury, which is one decision and reads as two fields.
    assert.ok(moved.length <= 2,
      `"${arm.name}" moves ${moved.join(" and ")} together, so the arm measures their sum`);
  }
});

test("every arm says what it is and what it would prove", () => {
  for (const arm of ARMS) {
    assert.ok((arm.what ?? "").length > 20, `${arm.name} has no description`);
    assert.ok(arm.subject, `${arm.name} names no subject to count`);
  }
  assert.ok(CONFIGS.length >= 2, "one configuration proves one configuration (CLAUDE.md)");
});

// --- a sample is not an era report (2026-10-13) -------------------------------
//
// `region_sweep` has refused to write below 200 games since X4g; `sim_sweep`
// did not, and `node tools/sim_sweep.mjs 3 3` wrote three games of three years
// straight over `reports/balance-era31.md` — 200 games of measurement replaced
// by a smoke test, with nothing but a timestamp to say so. Found by running
// exactly that while checking a main-module guard.
//
// A source check rather than a run, because the alternative is a ten-minute
// gate: what is asserted is that the write is INSIDE a games test, which is the
// shape both tools now share.

test("neither sweep writes an era report from a sample", () => {
  for (const name of ["sim_sweep", "region_sweep"]) {
    const source = readFileSync(join(repoRoot, "tools", `${name}.mjs`), "utf8");
    const guard = /if \(GAMES >= 200\) \{([\s\S]*?)\n  \}/.exec(source);
    assert.ok(guard, `${name} has no "200 games or it is a sample" guard`);
    assert.match(guard[1], /writeFile/, `${name}'s guard does not wrap the write`);
    const writes = [...source.matchAll(/await writeFile\(/g)].length;
    const guarded = [...guard[1].matchAll(/await writeFile\(/g)].length;
    assert.equal(writes, guarded,
      `${name} writes ${writes} file(s) and only ${guarded} are behind the sample guard`);
    assert.match(source, /SAMPLE, not an era report/,
      `${name} does not say so when it refuses to write`);
  }
});
