// Where the trees are (slice V8; spec §6.6).
//
// At city zoom a tree is an instanced cone and that is right — at eighteen
// pixels a tile there is nothing else to see. Standing under one, a cone is a
// cone: the L2 kit was still what a walker saw inside a baked chunk, because
// the tree pass was never gated on whether the chunk had been baked.
//
// The reason this file exists at all is that both passes have to agree about
// WHERE a tree is. Two copies of "a tree is at `jitter(index, 7)` across the
// tile" is a tree that jumps a few metres sideways the moment its chunk bakes,
// and jumps back when the player walks away — which is the class of defect
// nothing goes red for.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { tileAt } from "../shared/grid.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { treeAt, treesIn, TREE_KINDS } from "../client/world/foliage.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;
const FOREST = 2;
const GRASS = 0;

function wood(size = 16) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.terrain.fill(GRASS);
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) state.tiles.terrain[tileAt(size, x, y)] = FOREST;
  }
  return state;
}

// --- one tree ------------------------------------------------------------------

test("a tree stands inside its own tile", () => {
  const state = wood();
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) {
      const t = treeAt(tileAt(state.width, x, y), x, y);
      assert.ok(t.x > x * T && t.x < (x + 1) * T, `${t.x} is not inside tile ${x}`);
      assert.ok(t.z > y * T && t.z < (y + 1) * T, `${t.z} is not inside tile ${y}`);
    }
  }
});

test("a tree is the same tree every time it is asked for", () => {
  // The whole point: the instanced pass and the baked pass ask separately.
  const a = treeAt(1234, 7, 9);
  const b = treeAt(1234, 7, 9);
  assert.deepEqual(a, b);
});

test("no two neighbouring trees are the same tree", () => {
  const state = wood();
  const seen = new Set();
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) {
      const t = treeAt(tileAt(state.width, x, y), x, y);
      seen.add(`${t.variant}:${t.scale.toFixed(3)}:${t.spin.toFixed(3)}`);
    }
  }
  assert.ok(seen.size > 40, `a wood of 64 trees has ${seen.size} distinct ones in it`);
});

test("a tree has a species, a size and a spin, and all three are usable", () => {
  const t = treeAt(99, 3, 3);
  assert.ok(TREE_KINDS.includes(t.kind), `kind "${t.kind}"`);
  assert.ok(t.variant >= 0 && t.variant < 3);
  assert.ok(t.scale > 0.5 && t.scale < 1.6, `${t.scale}`);
  assert.ok(t.spin >= 0 && t.spin < Math.PI * 2);
});

// --- a chunk's worth ---------------------------------------------------------------

test("only forest tiles have trees on them", () => {
  const state = wood();
  const box = { x0: 0, z0: 0, x1: 16 * T, z1: 16 * T };
  for (const t of treesIn(state, box)) {
    const tx = Math.floor(t.x / T);
    const tz = Math.floor(t.z / T);
    assert.equal(state.tiles.terrain[tileAt(state.width, tx, tz)], FOREST,
      `a tree on a ${state.tiles.terrain[tileAt(state.width, tx, tz)]} tile`);
  }
});

test("a paved or built tile has no tree, whatever the terrain says", () => {
  // The L2 pass has always refused both; a baked chunk that did not would put a
  // tree through the middle of a house.
  const state = wood();
  state.tiles.road[tileAt(state.width, 5, 5)] = 16;
  state.tiles.buildingId[tileAt(state.width, 6, 6)] = 1;
  const box = { x0: 0, z0: 0, x1: 16 * T, z1: 16 * T };
  const at = new Set(treesIn(state, box).map((t) => `${Math.floor(t.x / T)},${Math.floor(t.z / T)}`));
  assert.equal(at.has("5,5"), false, "a tree in the road");
  assert.equal(at.has("6,6"), false, "a tree through a house");
});

test("a box only gets the trees inside it", () => {
  const state = wood();
  const half = { x0: 0, z0: 0, x1: 8 * T, z1: 16 * T };
  for (const t of treesIn(state, half)) assert.ok(t.x < 8 * T, `${t.x}`);
  const all = treesIn(state, { x0: 0, z0: 0, x1: 16 * T, z1: 16 * T });
  assert.ok(all.length > treesIn(state, half).length);
});

test("an empty box is empty, not undefined", () => {
  assert.deepEqual(treesIn(wood(), { x0: 0, z0: 0, x1: T, z1: T }), []);
});

test("the two passes place a tree in exactly the same spot", () => {
  // The defect this prevents: a tree that jumps sideways the moment its chunk
  // bakes, and jumps back when the player walks away.
  const state = wood();
  const index = tileAt(state.width, 7, 9);
  const one = treeAt(index, 7, 9);
  const [other] = treesIn(state, { x0: 7 * T, z0: 9 * T, x1: 8 * T, z1: 10 * T });
  assert.deepEqual(other, one);
});

// --- species, gardens and parks (S5) ---------------------------------------------
//
// Six species from three: a willow at the water, a conifer on rock, a street
// tree in a pit in front of a shop, an orchard row in a back garden, and a ring
// round a park. The species is a function of the terrain round a tile, the zone
// and building on a lot, and a hash — nothing else, so two clients plant the
// same town.

import { adjacencyMask } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { createModel } from "../client/world/model.js";
import { wildSpecies, treesFor, backGardens } from "../client/world/foliage.js";
import { houseLots } from "../client/world/homes.js";

const WATER = 3;
const ROCK = 5;

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

function place(state, b) {
  const building = {
    id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
    level: 1, valueTier: 1, occupancy: 30, condition: 100, builtTick: 0, flags: 0, ...b,
  };
  state.buildings.push(building);
  for (let y = building.y; y < building.y + building.h; y += 1) {
    for (let x = building.x; x < building.x + building.w; x += 1) {
      state.tiles.buildingId[tileAt(state.width, x, y)] = building.id;
    }
  }
  return building;
}

/** A small played-looking town: a street with houses on one side and shops on
 * the other, a park, a wood that reaches a lake and a crag. */
function town() {
  const size = 32;
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.terrain.fill(GRASS);
  state.tiles.elevation.fill(40);
  pave(state, Array.from({ length: 26 }, (_, k) => [3 + k, 10]));
  let id = 1;
  // Shallow lots on the left, deep ones on the right: a back garden two metres
  // deep has a bed in it, and only a deep one has room for a shed or an orchard.
  for (let x = 3; x < 13; x += 1) place(state, { id: id++, zone: 1, x, y: 9 });
  for (let x = 13; x < 25; x += 1) place(state, { id: id++, zone: 1, x, y: 8, h: 2 });
  for (let x = 3; x < 23; x += 1) place(state, { id: id++, zone: 2, x, y: 11 });
  place(state, { id: id++, zone: 0, def: "park", x: 23, y: 11, w: 2, h: 2 });
  for (let y = 18; y < 28; y += 1) for (let x = 4; x < 20; x += 1) state.tiles.terrain[tileAt(size, x, y)] = FOREST;
  for (let y = 18; y < 28; y += 1) state.tiles.terrain[tileAt(size, 20, y)] = WATER;
  for (let x = 4; x < 20; x += 1) state.tiles.terrain[tileAt(size, x, 28)] = ROCK;
  return { state, model: createModel(state) };
}

const tileOf = (t) => [Math.floor(t.x / T), Math.floor(t.z / T)];

test("a wild tree's species is a function of the terrain round it and a hash, nothing else", () => {
  const { state } = town();
  const i = (x, y) => tileAt(state.width, x, y);
  assert.equal(wildSpecies(state, 19, 22, i(19, 22)), "willow", "a tree at the water's edge");
  assert.equal(wildSpecies(state, 10, 27, i(10, 27)), "conifer", "a tree at the foot of the crag");
  const inner = wildSpecies(state, 10, 22, i(10, 22));
  assert.ok(["conifer", "round", "twin"].includes(inner), `a tree in the middle of the wood is a ${inner}`);
  assert.equal(wildSpecies(state, 10, 22, i(10, 22)), inner, "asked twice, two species");
  // The middle of a wood is what it always was: the wood did not change species.
  assert.equal(inner, treeAt(i(10, 22), 10, 22).kind);
});

test("all six species grow somewhere in a town that has the ground for them", () => {
  const { state, model } = town();
  const kinds = new Set(treesFor(state, model).list.map((t) => t.kind));
  for (const kind of TREE_KINDS) assert.ok(kinds.has(kind), `no ${kind} anywhere in the town`);
  assert.equal(TREE_KINDS.length, 6);
});

test("a street tree stands on the pavement in front of a shop, never in the road's lots", () => {
  const { state, model } = town();
  const street = treesFor(state, model).list.filter((t) => t.kind === "street");
  assert.ok(street.length > 0);
  for (const t of street) {
    const [x, y] = tileOf(t);
    const i = tileAt(state.width, x, y);
    assert.notEqual(state.tiles.road[i] & NET_PRESENT, 0, `a street tree off the street at ${x},${y}`);
    assert.equal(state.tiles.buildingId[i], 0, `a street tree in a building at ${x},${y}`);
    // On the SHOPS' side of the centre line: the street runs along y = 10 and
    // the shops are south of it.
    assert.ok(t.z > 10.5 * T, `a street tree on the houses' side at z ${t.z.toFixed(1)}`);
  }
});

test("an orchard row is in a house's back garden, behind the house and inside the lot", () => {
  const { state, model } = town();
  const orchard = treesFor(state, model).list.filter((t) => t.kind === "orchard");
  assert.ok(orchard.length >= 3 && orchard.length % 3 === 0, `${orchard.length} orchard trees`);
  for (const t of orchard) {
    const [x, y] = tileOf(t);
    const lot = model.lotOf(state.tiles.buildingId[tileAt(state.width, x, y)]);
    assert.ok(lot && lot.building.zone === 1, `an orchard tree outside a house lot at ${x},${y}`);
    // The houses face the street to their south, so the back garden is north.
    assert.ok(t.z < lot.cz, `an orchard tree in a front garden at z ${t.z.toFixed(1)}`);
  }
});

test("a back garden is between the house and the back of the lot", () => {
  const { model } = town();
  let gardens = 0;
  for (const lot of model.lots) {
    for (const g of backGardens(lot)) {
      gardens += 1;
      for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5]]) {
        const p = g.at(u, v);
        assert.ok(p.x >= lot.x0 - 1e-6 && p.x <= lot.x1 + 1e-6 && p.z >= lot.z0 - 1e-6 && p.z <= lot.z1 + 1e-6,
          `garden point ${u},${v} outside lot ${lot.id}`);
      }
      assert.ok(g.depth >= 1.2, `a ${g.depth.toFixed(1)} m back garden`);
      if (g.shed) assert.ok(g.depth >= 1.8, `a shed in a ${g.depth.toFixed(1)} m garden`);
      assert.equal(g.shed && g.orchard, false, "a shed and an orchard in one garden");
    }
  }
  assert.ok(gardens > 10, `${gardens} back gardens in a street of houses`);
});

test("a park's ring stands inside the park and leaves its path clear", () => {
  const { state, model } = town();
  const park = model.lots.find((l) => l.building.def === "park");
  const ring = treesFor(state, model).list.filter((t) => t.x > park.x0 && t.x < park.x1 && t.z > park.z0 && t.z < park.z1);
  assert.ok(ring.length >= 6, `${ring.length} trees in a two-by-two park`);
  const alongZ = park.frontage === 0 || park.frontage === 2;
  for (const t of ring) {
    const off = alongZ ? Math.abs(t.x - park.cx) : Math.abs(t.z - park.cz);
    assert.ok(off >= (alongZ ? park.x1 - park.x0 : park.z1 - park.z0) * 0.15, "a tree on the park's path");
  }
});

test("with the model or without, the wild trees are the same trees", () => {
  // The street baker asks with the model and older callers without; a wood that
  // differed between them is a tree that jumps when its chunk bakes.
  const { state, model } = town();
  const box = { x0: 0, z0: 16 * T, x1: 32 * T, z1: 32 * T };
  const without = treesIn(state, box);
  const within = treesIn(state, box, DEFAULTS, model);
  assert.deepEqual(within.filter((t) => ["conifer", "round", "twin", "willow"].includes(t.kind)), without);
  assert.equal(treesFor(state, model), treesFor(state, model), "the list was derived twice for one model");
});

test("a bed and a shed stand in the back garden, never inside a house", () => {
  // Both passes pose them from `backGardens`; a strip computed on the wrong
  // side of a house for one frontage puts the shed through the kitchen.
  const { model } = town();
  let checked = 0;
  for (const lot of model.lots) {
    const homes = houseLots(lot, lot.building.level ?? 0).lots;
    for (const g of backGardens(lot)) {
      for (const [u, v] of [[0.35, Math.min(1, g.depth / 2) / g.depth], [0.82, 0.5], [0.82, 0.72]]) {
        const p = g.at(u, v);
        checked += 1;
        assert.ok(!homes.some((h) => p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1),
          `a garden point inside a house on lot ${lot.id}`);
      }
    }
  }
  assert.ok(checked > 30, `${checked} points checked`);
});
