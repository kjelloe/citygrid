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
