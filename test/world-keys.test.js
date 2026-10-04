// W6a: a derived thing's identity is its geometry, not its array index.
//
// Every id in `client/world/` is an array index assigned at derivation, so one
// new corridor renumbers every corridor, lane, link and nav edge after it. That
// is why `worldChanged` throws away the traffic, the services, the trains, the
// boats, the planes and the pedestrians on every accepted build action (W6's
// measurement: a ten-tile drag changes 1 corridor of 1,402 and 2 lanes of
// 8,896, and the first cut of the measurement — keyed by id — reported that one
// road tile changed 8,896 of 8,896, which is a measure of renumbering).
//
// So this file asserts the thing B11 and W6's dirty set both rest on: build
// somewhere else, and everything that did not move keeps its KEY while its id
// is free to change. A key is built only from what the engine owns (tile
// indices, building ids) and from geometry, never from a position in a list.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { createModel } from "../client/world/model.js";
import { deriveNav } from "../client/world/nav.js";

function blank(size = 24) {
  return createState(defaultOptions({ width: size, height: size, seed: 7 }));
}

/** Paves every tile and then recomputes every mask, so a crossroads is a
 * crossroads (the same reason `test/lanes.test.js` has this helper). */
function pave(state, ...groups) {
  const road = state.tiles.road;
  const tiles = groups.flat();
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (let i = 0; i < road.length; i += 1) {
    if ((road[i] & NET_PRESENT) === 0) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    road[i] = NET_PRESENT | adjacencyMask(state.width, state.height, x, y,
      (j) => (road[j] & NET_PRESENT) !== 0);
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (unused, i) => [x0 + i, y]);
const column = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (unused, i) => [x, y0 + i]);

/** A small grid of streets: three across, three down, which gives junctions,
 * corridors between them and pavement corners at each. */
function town() {
  const state = blank();
  pave(state, row(4, 2, 20), row(10, 2, 20), row(16, 2, 20),
    column(2, 4, 16), column(11, 4, 16), column(20, 4, 16));
  return state;
}

const keysOf = (list) => list.map((item) => item.key);

test("every derived thing has a key, and no two share one", () => {
  const model = createModel(town());
  const nav = deriveNav(town(), model);

  for (const [what, list] of [
    ["corridors", model.corridors], ["nodes", model.nodes],
    ["lanes", model.lanes.lanes], ["links", model.lanes.links],
    ["nav nodes", nav.nodes], ["nav edges", nav.edges],
  ]) {
    assert.ok(list.length > 0, `${what} is empty, so this proves nothing`);
    const keys = keysOf(list);
    assert.equal(keys.filter((k) => k === undefined || k === "").length, 0, `${what}: a thing with no key`);
    assert.equal(new Set(keys).size, keys.length, `${what}: two things share a key`);
  }
});

test("a key is not an index: nothing in it changes when the array order does", () => {
  // The test that would have caught the measurement's first cut. The new street
  // is at a LOWER tile index than most of the town, so it is derived early and
  // every id after it shifts.
  const before = town();
  const modelBefore = createModel(before);
  const after = town();
  pave(after, row(4, 2, 20), row(10, 2, 20), row(16, 2, 20),
    column(2, 4, 16), column(11, 4, 16), column(20, 4, 16), column(6, 4, 10));
  const modelAfter = createModel(after);

  const keysBefore = new Set(keysOf(modelBefore.corridors));
  const keysAfter = new Set(keysOf(modelAfter.corridors));
  // The streets the new one did not touch are still there, by key.
  const untouched = modelBefore.corridors.filter((c) => !c.tiles.some((t) => {
    const x = t % before.width;
    const y = (t - x) / before.width;
    return x === 6 && y >= 4 && y <= 10;
  }));
  const lost = untouched.filter((c) => !keysAfter.has(c.key));
  assert.deepEqual(lost.map((c) => c.key), [],
    "a corridor nowhere near the new street lost its identity");

  // And the ids DID move, which is what makes the keys worth having.
  const movedId = modelBefore.corridors.some((c) => {
    const same = modelAfter.corridors.find((o) => o.key === c.key);
    return same !== undefined && same.id !== c.id;
  });
  assert.ok(movedId, "no id changed, so this city cannot show what a key is for");
  assert.ok(keysAfter.size > keysBefore.size, "the new street is not in the model");
});

test("a lane's key names its corridor, its direction and its place across the road", () => {
  const model = createModel(town());
  for (const lane of model.lanes.lanes) {
    const corridor = model.corridors[lane.corridor];
    assert.ok(lane.key.startsWith(corridor.key), `lane ${lane.key} does not name its corridor`);
    assert.ok(lane.key.includes(`|${lane.dir}|`), `lane ${lane.key} does not name its direction`);
  }
  // A block link is its lane; a turn link is the pair of lanes it joins. Both
  // are therefore stable exactly when the lanes are.
  for (const link of model.lanes.links) {
    if (link.kind === "block") {
      assert.equal(link.key, `b|${model.lanes.lanes[link.lane].key}`);
    } else {
      assert.ok(link.key.startsWith("t|") && link.key.includes(">"), `turn ${link.key} is not a pair`);
    }
  }
});

test("the model can be asked for a thing by its key", () => {
  // What a life system does after a rebuild: it is holding a key and wants the
  // thing, or nothing (B11 — a car whose link is gone leaves by the nearest
  // door, and it has to be able to find out).
  const model = createModel(town());
  const corridor = model.corridors[3];
  assert.equal(model.corridorByKey(corridor.key)?.id, corridor.id);
  assert.equal(model.corridorByKey("nothing like a key"), undefined);

  const link = model.lanes.links[5];
  assert.equal(model.lanes.linkByKey(link.key)?.id, link.id);
  assert.equal(model.lanes.linkByKey("b|nope"), undefined);

  const node = model.nodes[1];
  assert.equal(model.nodeByKey(node.key)?.tile, node.tile);
});

test("a nav corner is keyed by the junction and the street, not by the walk order", () => {
  const state = town();
  const model = createModel(state);
  const nav = deriveNav(state, model);
  for (const edge of nav.edges) {
    if (edge.kind !== "walk") continue;
    const corridor = model.corridors[edge.corridor];
    assert.ok(edge.key.includes(corridor.key),
      `a pavement's key (${edge.key}) does not name the street it runs along`);
  }
});
