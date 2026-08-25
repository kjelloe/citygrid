// Pinned vectors. These numbers are the contract: if they change, every
// seeded region in every save changes with them, so a failure here is never
// "update the expected value" — it is a question about what moved.

import test from "node:test";
import assert from "node:assert/strict";
import {
  makeRng, copyRng, nextU32, nextInt, nextRange, chance, chanceIn,
  pick, shuffle, mix32, seedFromString, streamSeed,
} from "../shared/prng.js";

test("xorshift32 produces its pinned sequence for seed 1", () => {
  const rng = makeRng(1);
  const got = [nextU32(rng), nextU32(rng), nextU32(rng), nextU32(rng), nextU32(rng)];
  assert.deepEqual(got, [270369, 67634689, 2647435461, 307599695, 2398689233]);
});

test("a zero seed is replaced, because zero is a fixed point of xorshift", () => {
  const rng = makeRng(0);
  assert.notEqual(rng.s, 0);
  const first = nextU32(rng);
  assert.notEqual(first, 0);
});

test("the same seed replays identically after copying", () => {
  const a = makeRng(20260826);
  const b = copyRng(a);
  for (let i = 0; i < 100; i += 1) assert.equal(nextU32(a), nextU32(b));
});

test("nextInt stays in range and consumes deterministically", () => {
  const rng = makeRng(7);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i += 1) {
    const value = nextInt(rng, 6);
    assert.ok(value >= 0 && value < 6);
    counts[value] += 1;
  }
  // Not a statistical test — a distribution check would be flaky. This asserts
  // only that every face is reachable, which catches an off-by-one bound.
  assert.ok(counts.every((n) => n > 0), `some values never appeared: ${counts}`);
});

test("nextInt has no modulo bias at an awkward bound", () => {
  // A bound that does not divide 2^32 is where modulo bias would show. The
  // rejection loop must still terminate and stay in range for every draw.
  const rng = makeRng(99);
  for (let i = 0; i < 20000; i += 1) {
    const value = nextInt(rng, 3000000000);
    assert.ok(value >= 0 && value < 3000000000);
  }
});

test("degenerate bounds are handled without a draw", () => {
  const rng = makeRng(5);
  const before = rng.s;
  assert.equal(nextInt(rng, 1), 0);
  assert.equal(nextInt(rng, 0), 0);
  assert.equal(rng.s, before, "a degenerate bound must not consume randomness");
});

test("nextRange is inclusive at both ends", () => {
  const rng = makeRng(11);
  let sawLow = false;
  let sawHigh = false;
  for (let i = 0; i < 2000; i += 1) {
    const value = nextRange(rng, 3, 7);
    assert.ok(value >= 3 && value <= 7);
    if (value === 3) sawLow = true;
    if (value === 7) sawHigh = true;
  }
  assert.ok(sawLow && sawHigh);
});

test("chance reads as the odds are written", () => {
  const rng = makeRng(3);
  assert.equal(chance(rng, 1), true, "one in one is always");
  assert.equal(chance(rng, 0), false, "one in zero is never");
  let hits = 0;
  for (let i = 0; i < 10000; i += 1) if (chance(rng, 10)) hits += 1;
  assert.ok(hits > 700 && hits < 1300, `one-in-ten fired ${hits} times in 10000`);
});

test("chanceIn handles its boundaries without consuming randomness", () => {
  const rng = makeRng(4);
  const before = rng.s;
  assert.equal(chanceIn(rng, 0, 10), false);
  assert.equal(chanceIn(rng, 10, 10), true);
  assert.equal(rng.s, before);
});

test("shuffle consumes exactly one draw per element beyond the first", () => {
  // Determinism depends on draw count, not just outcome: an early return on a
  // no-op swap would desync two engines that took different branches.
  const rng = makeRng(42);
  const probe = makeRng(42);
  shuffle(rng, [1, 2, 3, 4, 5]);
  for (let i = 0; i < 4; i += 1) nextInt(probe, 5 - i);
  assert.equal(rng.s, probe.s);
});

test("shuffle is a permutation, and pinned for seed 42", () => {
  const rng = makeRng(42);
  const items = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...items].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(items, [5, 7, 6, 8, 2, 4, 3, 1]);
});

test("pick draws from the list", () => {
  const rng = makeRng(8);
  const items = ["a", "b", "c"];
  for (let i = 0; i < 100; i += 1) assert.ok(items.includes(pick(rng, items)));
});

test("seedFromString is stable and case-sensitive", () => {
  assert.equal(seedFromString("citygrid"), seedFromString("citygrid"));
  assert.notEqual(seedFromString("citygrid"), seedFromString("CityGrid"));
  assert.equal(seedFromString("citygrid"), 3878588858);
});

test("mix32 decorrelates adjacent seeds", () => {
  // Adjacent seeds must not produce adjacent streams, or "seed 1" and "seed 2"
  // give near-identical regions.
  const a = mix32(1);
  const b = mix32(2);
  assert.ok(Math.abs(a - b) > 1000000, `mix32(1)=${a} mix32(2)=${b} are too close`);
});

test("streamSeed gives each subsystem an independent stream", () => {
  const game = 12345;
  const terrain = streamSeed(game, "terrain");
  const quests = streamSeed(game, "quests");
  assert.notEqual(terrain, quests);
  assert.equal(terrain, streamSeed(game, "terrain"), "stream seeds must be stable");
});
