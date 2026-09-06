// The street cache's policy (slices E2, E3; spec §6.4).
//
// `street-chunks.js` imports three and node cannot resolve three, so anything
// left inside it is invisible to this suite. Three defects in this lane have
// already lived exactly there — an undefined constant, an orthographic ray, a
// re-export that never bound its name — so what is worth testing is pulled out:
// which chunk to build next, which to let go, and which pieces share a mesh.

import test from "node:test";
import assert from "node:assert/strict";
import { signature, nextBuild, expired } from "../client/render/streaming.js";

const chunk = (key, distance) => ({ key, cx: key % 8, cy: (key / 8) | 0, distance });
const liveMap = (entries) => new Map(entries.map((e) => [e.key, e]));

// --- buckets -----------------------------------------------------------------

test("buckets split on transparency", () => {
  // A transparent piece in an opaque bucket is depth-sorted wrongly, and the
  // whole bucket is one mesh, so there is no fixing it afterwards.
  assert.notEqual(signature({ transparent: true }), signature({}));
  assert.equal(signature({ transparent: true }), signature({ transparent: true }));
});

test("buckets split on emissive, so night can dial them separately", () => {
  assert.notEqual(signature({ emissive: 0xffcc88 }), signature({}));
  assert.notEqual(signature({ emissive: 0xffcc88 }), signature({ emissive: 0x88ccff }));
});

test("buckets split on side and on bands", () => {
  assert.notEqual(signature({ side: "double" }), signature({}));
  assert.notEqual(signature({ bands: 3 }), signature({ bands: 4 }));
});

test("two plain pieces share one bucket", () => {
  // The whole point: a hundred differently coloured walls are one draw call,
  // because the colour is a vertex attribute and not a material (ruling 022).
  assert.equal(signature({}), signature({}));
  assert.equal(signature(), signature({}));
});

// --- what to build next ------------------------------------------------------

test("the nearest missing chunk is the one built", () => {
  const wanted = [chunk(1, 5), chunk(2, 9), chunk(3, 20)];
  const live = liveMap([{ key: 1, hash: 100, seen: 0 }]);
  const next = nextBuild(wanted, live, (c) => c.key * 100);
  assert.equal(next.chunk.key, 2, "it skipped past a chunk it does not have");
  assert.equal(next.stale, false);
});

test("a live chunk whose hash moved is rebuilt before a farther missing one", () => {
  // A stale chunk in front of you is worse than a missing one behind: the
  // missing one is covered by the L2 pools, the stale one is a lie.
  const wanted = [chunk(1, 5), chunk(2, 9)];
  const live = liveMap([{ key: 1, hash: 999, seen: 0 }]);
  const next = nextBuild(wanted, live, (c) => c.key * 100);
  assert.equal(next.chunk.key, 1);
  assert.equal(next.stale, true);
  assert.equal(next.hash, 100, "the new hash is not handed back with the decision");
});

test("nothing to do is nothing to do", () => {
  const wanted = [chunk(1, 5), chunk(2, 9)];
  const live = liveMap([{ key: 1, hash: 100, seen: 0 }, { key: 2, hash: 200, seen: 0 }]);
  assert.equal(nextBuild(wanted, live, (c) => c.key * 100), undefined);
});

test("one decision per call, whatever else is missing", () => {
  // At most one build a frame: the budget for a frame is a frame.
  const wanted = [chunk(1, 5), chunk(2, 9), chunk(3, 20)];
  const next = nextBuild(wanted, new Map(), (c) => c.key);
  assert.equal(next.chunk.key, 1);
  assert.equal(typeof next.chunk.key, "number", "a single decision, not a list");
});

// --- what to let go ----------------------------------------------------------

test("a chunk outside the radius survives the grace period", () => {
  // Without it, panning a street back and forth across a boundary rebuilds the
  // same geometry every second, and the cache costs what it exists to save.
  const live = liveMap([{ key: 7, hash: 1, seen: 1000 }]);
  assert.deepEqual(expired(live, new Set(), 1500, 2000), [], "dropped inside the grace");
  assert.deepEqual(expired(live, new Set(), 3001, 2000), [7]);
});

test("a chunk still wanted is never dropped, however old", () => {
  const live = liveMap([{ key: 7, hash: 1, seen: 0 }]);
  assert.deepEqual(expired(live, new Set([7]), 1e9, 2000), []);
});

test("expiry names every chunk that qualifies, not just the first", () => {
  const live = liveMap([
    { key: 1, hash: 1, seen: 0 }, { key: 2, hash: 1, seen: 0 }, { key: 3, hash: 1, seen: 9000 },
  ]);
  assert.deepEqual(expired(live, new Set(), 10000, 2000).sort(), [1, 2]);
});

// --- the review's finding (R1.5) ---------------------------------------------

test("a change in one chunk leaves the others alone", () => {
  // `worldChanged` cleared the whole cache, so every road tile painted threw
  // away nine baked chunks and re-baked them one a frame — six frames of L2
  // after every build action. The hash is what decides.
  const wanted = [
    { key: 1, cx: 0, cy: 0 }, { key: 2, cx: 1, cy: 0 }, { key: 3, cx: 2, cy: 0 },
  ];
  const hashes = new Map([[1, "a"], [2, "b"], [3, "c"]]);
  const live = new Map(wanted.map((c) => [c.key, { hash: hashes.get(c.key), seen: 0 }]));
  const hashOf = (chunk) => hashes.get(chunk.key);

  assert.equal(nextBuild(wanted, live, hashOf), undefined, "nothing changed, nothing to build");

  hashes.set(2, "b2");
  const next = nextBuild(wanted, live, hashOf);
  assert.equal(next.chunk.key, 2, "the wrong chunk was picked as stale");
  assert.equal(next.stale, true);

  // ...and after it is rebuilt, the others are still not stale.
  live.set(2, { hash: "b2", seen: 0 });
  assert.equal(nextBuild(wanted, live, hashOf), undefined);
});
