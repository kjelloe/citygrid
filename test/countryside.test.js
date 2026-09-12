// The countryside (slice S2, D4 finding 2).
//
// Beyond the built area, unzoned grass is drawn as FIELDS — a meadow or a
// striped crop in blocks of four tiles, hedgerows along some block edges, a
// farm track now and then — so the town sits in a landscape and has an edge.
// `client/world/countryside.js` decides it from the tile, its distance to
// anything built, and the map's seed; nothing else, so two clients draw the
// same farms and a screenshot is the same picture twice.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT, TERRAIN_GRASS, TERRAIN_WATER } from "../client/constants-mirror.js";
import { createCountryside, FIELD_REACH, FIELD_BLOCK } from "../client/world/countryside.js";

function blank(size = 40, seed = 7) {
  return createState(defaultOptions({ width: size, height: size, seed }));
}

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

/** A small town in the middle of a grass map: a street, a zoned strip, a house. */
function town(seed = 7) {
  const state = blank(40, seed);
  state.tiles.terrain.fill(TERRAIN_GRASS);
  pave(state, row(20, 14, 26));
  for (let x = 14; x <= 26; x += 1) state.tiles.zone[tileAt(40, x, 21)] = 1;
  state.tiles.buildingId[tileAt(40, 18, 19)] = 3;
  return state;
}

function everyField(state) {
  const country = createCountryside(state);
  const out = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const f = country.at(x, y);
      if (f) out.push({ x, y, f });
    }
  }
  return out;
}

const builtAt = (state, x, y) => {
  const i = tileAt(state.width, x, y);
  return (state.tiles.road[i] & NET_PRESENT) !== 0 || state.tiles.zone[i] !== 0 || state.tiles.buildingId[i] !== 0;
};

test("fields are only ever on open grass: never paved, zoned, built or wet", () => {
  const state = town();
  // Some water too, which is never a field.
  for (let x = 0; x < 6; x += 1) state.tiles.terrain[tileAt(40, x, 2)] = TERRAIN_WATER;
  const fields = everyField(state);
  assert.ok(fields.length > 200, `only ${fields.length} field tiles on a mostly empty map`);
  for (const { x, y } of fields) {
    assert.equal(builtAt(state, x, y), false, `a field on built ground at ${x},${y}`);
    assert.equal(state.tiles.terrain[tileAt(40, x, y)], TERRAIN_GRASS, `a field on non-grass at ${x},${y}`);
  }
});

test("the fields keep their distance from the town", () => {
  // Right up against a street a field reads as a vacant lot; the verge and
  // the edge of town stay grass.
  const state = town();
  for (const { x, y } of everyField(state)) {
    for (let dy = -(FIELD_REACH - 1); dy <= FIELD_REACH - 1; dy += 1) {
      for (let dx = -(FIELD_REACH - 1); dx <= FIELD_REACH - 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= 40 || ny >= 40) continue;
        assert.equal(builtAt(state, nx, ny), false, `a field at ${x},${y} within ${FIELD_REACH - 1} of built ${nx},${ny}`);
      }
    }
  }
});

test("the pattern is a function of the tile and the seed, and nothing else", () => {
  const key = (fields) => fields.map(({ x, y, f }) => `${x},${y}:${f.kind}:${f.stripe}:${f.tone}:${f.hedge.join("")}:${f.track}`).join(" ");
  const a = everyField(town(7));
  const b = everyField(town(7));
  assert.equal(key(a), key(b), "the same map and seed drew two different farms");
  // Asked in a different order, the same answers — no hidden state.
  const state = town(7);
  const country = createCountryside(state);
  const backwards = [];
  for (let y = 39; y >= 0; y -= 1) for (let x = 39; x >= 0; x -= 1) {
    const f = country.at(x, y);
    if (f) backwards.push({ x, y, f });
  }
  backwards.reverse();
  assert.equal(key(backwards), key(a), "the answer depended on the order it was asked in");
  assert.notEqual(key(everyField(town(8))), key(a), "a different seed drew the same farms");
});

test("one field is one crop: a block shares its kind, stripe and tone", () => {
  const blocks = new Map();
  for (const { x, y, f } of everyField(town())) {
    const k = `${Math.floor(x / FIELD_BLOCK)},${Math.floor(y / FIELD_BLOCK)}`;
    const sig = `${f.kind}:${f.stripe}:${f.tone}`;
    if (!blocks.has(k)) blocks.set(k, sig);
    assert.equal(blocks.get(k), sig, `field ${k} changes crop inside itself`);
  }
  const kinds = new Set([...blocks.values()].map((s) => s.split(":")[0]));
  assert.ok(kinds.has("crop") && kinds.has("meadow"), `only ${[...kinds].join(", ")} on the whole map`);
});

test("fields are divided by hedgerows, and a farm track is rarer than a hedge", () => {
  let hedges = 0;
  let tracks = 0;
  for (const { x, y, f } of everyField(town())) {
    hedges += f.hedge.filter(Boolean).length;
    if (f.track) tracks += 1;
    // A hedge only ever stands on the edge between two fields' blocks.
    f.hedge.forEach((on, side) => {
      if (!on) return;
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
      const nx = x + dx;
      const ny = y + dy;
      assert.notEqual(`${Math.floor(nx / FIELD_BLOCK)},${Math.floor(ny / FIELD_BLOCK)}`,
        `${Math.floor(x / FIELD_BLOCK)},${Math.floor(y / FIELD_BLOCK)}`, `a hedge across the middle of a field at ${x},${y}`);
    });
  }
  assert.ok(hedges > 20, `only ${hedges} hedge pieces`);
  assert.ok(tracks > 0 && tracks < hedges, `${tracks} track tiles against ${hedges} hedge pieces`);
});
