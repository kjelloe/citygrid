// Chunk identity and order (slice E2; spec §6.4).
//
// A baked chunk is expensive to build and cheap to keep, so the cache's whole
// value is knowing when a chunk has actually changed. The hash is what decides
// that, and it has exactly two failure modes: too sensitive, and every build
// action rebuilds the whole city; not sensitive enough, and a road appears
// under a chunk that never notices.
//
// Pure, in `client/world/`.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { CHUNK, chunkHash, chunksNear, chunkKey, chunkOf, chunkOfLot } from "../client/world/chunks.js";
import { DEFAULTS } from "../client/world/config.js";

function blank(size = 64) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.elevation.fill(40);
  return state;
}

const place = (state, b) => {
  const building = {
    id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
    level: 1, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0, ...b,
  };
  state.buildings.push(building);
  state.tiles.buildingId[tileAt(state.width, building.x, building.y)] = building.id;
  return building;
};

// --- the hash ----------------------------------------------------------------

test("the territory overlay is part of a chunk's identity (V7, A44)", () => {
  // The L2 instanced buildings take their colour from the owner the moment the
  // overlay is on; a BAKED chunk keeps whatever colour it was built with, so at
  // street zoom the same city showed player colours in the distance and family
  // colours underfoot. Salting the hash with the flag marks every baked chunk
  // stale on the toggle and they come back painted the other way.
  const state = blank();
  place(state, { id: 1, x: 20, y: 20, owner: 2 });
  assert.notEqual(chunkHash(state, 1, 1, true), chunkHash(state, 1, 1, false));
  assert.equal(chunkHash(state, 1, 1, true), chunkHash(state, 1, 1, true));
  assert.equal(chunkHash(state, 1, 1), chunkHash(state, 1, 1, false),
    "the flag defaults to off, so nothing else has to pass it");
});

test("a hash is stable for a state that has not changed", () => {
  const state = blank();
  assert.equal(chunkHash(state, 1, 1), chunkHash(state, 1, 1));
});

test("painting a road in the chunk changes its hash", () => {
  const state = blank();
  const before = chunkHash(state, 1, 1);
  state.tiles.road[tileAt(64, CHUNK + 3, CHUNK + 3)] = NET_PRESENT | 5;
  assert.notEqual(chunkHash(state, 1, 1), before);
});

test("painting a road ELSEWHERE does not", () => {
  // The whole point of the cache. If a build anywhere invalidated every chunk,
  // the cache would cost the rebuild it exists to avoid.
  const state = blank();
  const before = chunkHash(state, 1, 1);
  state.tiles.road[tileAt(64, 50, 50)] = NET_PRESENT | 5;
  assert.equal(chunkHash(state, 1, 1), before);
});

test("every layer the chunk draws is in its hash", () => {
  const layers = ["terrain", "elevation", "zone", "road", "buildingId"];
  for (const layer of layers) {
    const state = blank();
    const before = chunkHash(state, 1, 1);
    state.tiles[layer][tileAt(64, CHUNK + 2, CHUNK + 2)] += 1;
    assert.notEqual(chunkHash(state, 1, 1), before, `${layer} is not in the hash`);
  }
});

test("a building anchored in the chunk is in its hash, and one outside is not", () => {
  // A building's RECORD matters, not only the tile that points at it: a lot
  // that grows a storey changes what is drawn without changing a tile.
  const state = blank();
  const building = place(state, { id: 1, x: CHUNK + 4, y: CHUNK + 4 });
  const before = chunkHash(state, 1, 1);
  building.level = 3;
  assert.notEqual(chunkHash(state, 1, 1), before, "a building's own record is not in the hash");

  const far = chunkHash(state, 3, 3);
  place(state, { id: 2, x: 50, y: 50 });
  assert.notEqual(chunkHash(state, 3, 3), far);
  assert.equal(chunkHash(state, 1, 1), chunkHash(state, 1, 1));
});

test("two different chunks of an empty map still differ", () => {
  // Their coordinates are part of their identity, or a cache keyed by hash
  // alone hands one chunk's geometry to another.
  const state = blank();
  assert.notEqual(chunkHash(state, 0, 0), chunkHash(state, 1, 0));
  assert.notEqual(chunkHash(state, 0, 0), chunkHash(state, 0, 1));
});

test("the hash is a number, and a stable one across runs", () => {
  const state = blank();
  const h = chunkHash(state, 2, 2);
  assert.equal(typeof h, "number");
  assert.ok(Number.isInteger(h));
  assert.equal(chunkHash(blank(), 2, 2), h, "two identical maps hash differently");
});

// --- the order ---------------------------------------------------------------

test("chunks come back nearest first", () => {
  // One build a frame, nearest first: the order IS the streaming policy.
  // NOT on a chunk boundary: at exactly (32, 32) the chunks either side are
  // equidistant and "nearest" is a tie the key breaks, which says nothing.
  const view = { targetX: 36, targetZ: 36 };
  const near = chunksNear(view, 3, 64, 64);
  assert.ok(near.length > 1);
  const distance = (c) => Math.hypot((c.cx + 0.5) * CHUNK - 36, (c.cy + 0.5) * CHUNK - 36);
  for (let i = 1; i < near.length; i += 1) {
    assert.ok(distance(near[i]) >= distance(near[i - 1]) - 1e-9,
      `chunk ${i} is nearer than the one before it`);
  }
  assert.equal(near[0].cx, 2, "the nearest chunk is not the one under the camera");
  assert.equal(near[0].cy, 2);
});

test("the radius is a radius, in chunks", () => {
  const view = { targetX: 36, targetZ: 36 };
  assert.ok(chunksNear(view, 1, 64, 64).length <= 9);
  assert.ok(chunksNear(view, 0, 64, 64).length === 1);
  assert.ok(chunksNear(view, 3, 64, 64).length > chunksNear(view, 1, 64, 64).length);
});

test("chunks off the map are not offered", () => {
  const view = { targetX: 2, targetZ: 2 };
  for (const c of chunksNear(view, 4, 64, 64)) {
    assert.ok(c.cx >= 0 && c.cy >= 0, `${c.cx},${c.cy} is off the map`);
    assert.ok(c.cx < 4 && c.cy < 4, `${c.cx},${c.cy} is past the edge of a 64-tile map`);
  }
});

test("a key round-trips", () => {
  for (const [cx, cy] of [[0, 0], [3, 7], [7, 3], [63, 63]]) {
    assert.equal(chunkKey(cx, cy), chunkKey(cx, cy));
    assert.notEqual(chunkKey(cx, cy), chunkKey(cy, cx === cy ? cy + 1 : cx));
  }
  assert.deepEqual(chunkOf(20, 40), { cx: 1, cy: 2 });
});

// --- one rule for which chunk owns a lot (slice R2, finding 1) ---------------

test("a lot straddling a boundary is claimed by exactly one chunk", () => {
  // `bakeLots` claimed a lot whose CENTRE was in the chunk; `instances.js`
  // skipped the L2 box whose ANCHOR TILE was in a baked chunk. A 2×2 building
  // across a boundary was therefore drawn twice — facade and box, z-fighting on
  // every face — or not at all.
  const T = DEFAULTS.tileM;
  // A 2×2 lot whose anchor tile is in chunk (0,0) and whose centre is in (1,0).
  const lot = {
    x0: (CHUNK - 1) * T, x1: (CHUNK + 1) * T,
    z0: 2 * T, z1: 4 * T,
    cx: CHUNK * T, cz: 3 * T,
    building: { x: CHUNK - 1, y: 2, w: 2, h: 2 },
  };
  const claimed = chunkOfLot(lot);
  assert.deepEqual(claimed, chunkOf(lot.cx / T, lot.cz / T),
    "the owner is not the chunk the centre is in");
  const byAnchor = chunkOf(lot.building.x, lot.building.y);
  assert.notDeepEqual(claimed, byAnchor, "the fixture must actually straddle a boundary");
});

test("every lot is claimed exactly once", () => {
  const T = DEFAULTS.tileM;
  const seen = new Map();
  for (let i = 0; i < 40; i += 1) {
    const lot = { cx: (i * 7 + 0.5) * T, cz: (i * 11 + 0.5) * T };
    const owner = chunkOfLot(lot);
    const key = chunkKey(owner.cx, owner.cy);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  // Every lot got an answer, and the answer is stable.
  for (let i = 0; i < 40; i += 1) {
    const lot = { cx: (i * 7 + 0.5) * T, cz: (i * 11 + 0.5) * T };
    assert.deepEqual(chunkOfLot(lot), chunkOfLot(lot));
  }
  assert.ok(seen.size > 1);
});
