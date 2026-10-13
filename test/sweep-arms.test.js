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
