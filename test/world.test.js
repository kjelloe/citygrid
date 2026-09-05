// cityviewer's city model (rulings 032, 035, 038; specs/engine/04-city-model.md).
//
// The model is pure, so everything it derives is a fixture assertion here —
// which matters because these are the bugs that look fine in a screenshot: a
// frontage facing away from its road, a corridor a tile short, a building
// seated on the mean of its corners and floating at one of them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt, DIR4 } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { TERRAIN_WATER } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { nodeKind } from "../client/world/corridors.js";
import { buildingParams, variantFor, unitHeight, storeys, VARIANTS } from "../client/world/params.js";
import { pseudo, jitter } from "../client/world/hash.js";
import { PALETTES } from "../client/render/palettes.js";

const T = DEFAULTS.tileM;

function blank(size = 8) {
  return createState(defaultOptions({ width: size, height: size, seed: 7 }));
}

/** Paves tiles and maintains the connection masks the reducer would. */
function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

function place(state, b) {
  const building = { id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1, level: 1, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0, ...b };
  state.buildings.push(building);
  for (let y = building.y; y < building.y + building.h; y += 1) {
    for (let x = building.x; x < building.x + building.w; x += 1) {
      state.tiles.buildingId[tileAt(state.width, x, y)] = building.id;
    }
  }
  return building;
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);
const column = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k]);

// --- the frame ---------------------------------------------------------------

test("the config mirror matches data/cityviewer.json", () => {
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8"));
  delete file.note;
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULTS)), file, "client/world/config.js has drifted from data/cityviewer.json");
});

test("a tile is twenty metres and relief is half a metre a step (rulings 035, 038)", () => {
  assert.equal(getConfig().tileM, 20);
  assert.equal(getConfig().reliefM, 0.5);
});

// --- corridors ---------------------------------------------------------------

test("a straight road of N tiles is one corridor of N × TILE_M less nothing", () => {
  const state = blank();
  pave(state, row(3, 1, 6));
  const m = createModel(state);
  assert.equal(m.corridors.length, 1);
  assert.equal(m.nodes.length, 2);
  assert.deepEqual(m.nodes.map((n) => n.kind), ["end", "end"]);
  // end to end, centre to centre: five tile lengths between six tiles
  assert.equal(m.corridors[0].length, 5 * T);
  assert.equal(m.corridors[0].points[0].x, 1.5 * T);
  assert.equal(m.corridors[0].points[0].z, 3.5 * T);
});

test("a T is one junction and three corridors; an X is four", () => {
  const state = blank();
  pave(state, [...row(3, 1, 6), ...column(4, 3, 6)]);
  const m = createModel(state);
  assert.equal(m.nodes.filter((n) => n.kind === "junction").length, 1);
  assert.equal(m.corridors.length, 3);

  const cross = blank();
  pave(cross, [...row(3, 1, 6), ...column(4, 1, 6)]);
  const x = createModel(cross);
  assert.equal(x.nodes.filter((n) => n.kind === "junction").length, 1);
  assert.equal(x.corridors.length, 4);
});

test("a bend is two corridors and a connector curve through the node", () => {
  const state = blank();
  pave(state, [...row(1, 1, 5), ...column(5, 1, 5)]);
  const m = createModel(state);
  assert.equal(m.nodes.filter((n) => n.kind === "bend").length, 1);
  assert.equal(m.corridors.length, 2);
  assert.equal(m.connectors.length, 1);
  const c = m.connectors[0];
  assert.ok(c.points.length >= 5, "the connector is a sampled curve, not a segment");
  // the curve starts on one corridor's line and ends on the other's
  assert.equal(c.points[0].z, 1.5 * T);
  assert.equal(c.points[c.points.length - 1].x, 5.5 * T);
});

test("a ring of road with no node still becomes a corridor", () => {
  const state = blank();
  pave(state, [...row(1, 1, 4), ...row(4, 1, 4), ...column(1, 1, 4), ...column(4, 1, 4)]);
  const m = createModel(state);
  // four corners are bends, so four corridors — but a ring of bends has nodes;
  // the nodeless case is a 2×2 block, whose every tile is a bend as well, so
  // the synthetic-node path is exercised with a mask the reducer never makes.
  assert.equal(m.corridors.length, 4);
  const loop = blank();
  const road = loop.tiles.road;
  for (const [x, y] of row(2, 2, 3)) road[tileAt(loop.width, x, y)] = NET_PRESENT | 10;   // east-west, endless
  const l = createModel(loop);
  assert.equal(l.nodes.length, 1);
  assert.equal(l.nodes[0].kind, "loop");
  assert.equal(l.corridors.length, 1);
});

test("nodeKind reads a mask the way the road renderer does", () => {
  assert.equal(nodeKind(5), "");
  assert.equal(nodeKind(10), "");
  assert.equal(nodeKind(3), "bend");
  assert.equal(nodeKind(1), "end");
  assert.equal(nodeKind(0), "isolated");
  assert.equal(nodeKind(7), "junction");
});

test("surfaceAt says road on a road tile's centre, sidewalk beside it, ground beyond", () => {
  const state = blank();
  pave(state, row(3, 1, 6));
  const m = createModel(state);
  const cz = 3.5 * T;
  assert.equal(m.surfaceAt(3.5 * T, cz).kind, "road");
  assert.equal(m.surfaceAt(3.5 * T, cz + DEFAULTS.road.width / 2 + 1).kind, "sidewalk");
  assert.equal(m.surfaceAt(3.5 * T, cz + T).kind, "ground");
  assert.equal(m.surfaceAt(3.5 * T, 0.5 * T).kind, "ground");
});

test("an isolated road tile is a node with a road surface", () => {
  const state = blank();
  pave(state, [[4, 4]]);
  const m = createModel(state);
  assert.equal(m.nodes.length, 1);
  assert.equal(m.nodes[0].kind, "isolated");
  assert.equal(m.surfaceAt(4.5 * T, 4.5 * T).kind, "road");
});

// --- the ground --------------------------------------------------------------

function slope(state) {
  // elevation rises one step per tile eastward: with reliefM 0.5, 0.5 m a tile
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) state.tiles.elevation[tileAt(state.width, x, y)] = x * 4;
  }
}

test("the land is bilinear over averaged corners, in metres", () => {
  const state = blank();
  slope(state);
  const m = createModel(state);
  // tile x=3 has elevation 12 → 6 m; its west corner averages tiles 2 and 3
  assert.ok(Math.abs(m.landAt(3 * T, 4 * T) - 5) < 1e-9);
  assert.ok(Math.abs(m.landAt(3.5 * T, 4 * T) - 6) < 1e-9);
  assert.ok(Math.abs(m.heightAt(3.5 * T, 4 * T) - 6) < 1e-9, "no road: heightAt is the land");
});

test("a corridor is level across its width on a cross-slope, and blends back out", () => {
  const state = blank();
  slope(state);
  pave(state, column(4, 1, 6));   // a north-south road across an east-rising slope
  const m = createModel(state);
  const cx = 4.5 * T;
  const centre = m.heightAt(cx, 3.5 * T);
  const half = DEFAULTS.road.width / 2;
  for (const dx of [-half + 0.1, -half / 2, 0, half / 2, half - 0.1]) {
    assert.ok(Math.abs(m.heightAt(cx + dx, 3.5 * T) - centre) < 0.02, `road not level at ${dx}: ${m.heightAt(cx + dx, 3.5 * T)} vs ${centre}`);
  }
  const far = m.heightAt(cx + half + DEFAULTS.road.blend + 2, 3.5 * T);
  assert.ok(Math.abs(far - m.landAt(cx + half + DEFAULTS.road.blend + 2, 3.5 * T)) < 1e-9, "beyond the blend the ground is the land again");
  // no crease: the field is monotone across the blend
  let prev = centre;
  for (let d = half; d <= half + DEFAULTS.road.blend; d += 0.25) {
    const h = m.heightAt(cx + d, 3.5 * T);
    assert.ok(h >= prev - 1e-9, `the blend dips at ${d}`);
    prev = h;
  }
});

test("a water tile never rises above the water level", () => {
  const state = blank();
  slope(state);
  state.tiles.terrain[tileAt(state.width, 1, 1)] = TERRAIN_WATER;
  state.tiles.terrain[tileAt(state.width, 6, 6)] = TERRAIN_WATER;   // high water, so the level is its height
  const m = createModel(state);
  assert.ok(m.heightAt(6.5 * T, 6.5 * T) <= m.waterLevel + 1e-9);
  assert.ok(m.heightAt(1.5 * T, 1.5 * T) <= m.waterLevel + 1e-9);
  assert.equal(m.surfaceAt(1.5 * T, 1.5 * T).kind, "water");
});

// --- lots --------------------------------------------------------------------

test("a lot fronts the road beside it, and a corner lot picks one side by hash", () => {
  const state = blank();
  pave(state, row(3, 0, 7));
  place(state, { id: 1, x: 2, y: 4, zone: 1 });   // road to the north
  place(state, { id: 2, x: 5, y: 2, zone: 2 });   // road to the south
  const m = createModel(state);
  assert.equal(m.lotOf(1).frontage, 0);
  assert.equal(m.lotOf(2).frontage, 2);
  assert.ok(m.lotOf(1).facing);

  const corner = blank();
  pave(corner, [...row(3, 0, 7), ...column(3, 0, 7)]);
  place(corner, { id: 9, x: 4, y: 4, zone: 1 });  // road north and west
  const c = createModel(corner);
  assert.ok([0, 3].includes(c.lotOf(9).frontage), "a corner lot faces one of its two roads");
});

test("a lot with no road beside it faces the nearest corridor; none at all faces north and says so", () => {
  const state = blank();
  pave(state, column(7, 0, 7));
  place(state, { id: 1, x: 1, y: 3, zone: 1 });
  const m = createModel(state);
  assert.equal(m.lotOf(1).frontage, 1, "the road is to the east");
  assert.ok(m.lotOf(1).facing);

  const empty = blank();
  place(empty, { id: 1, x: 1, y: 3, zone: 1 });
  const e = createModel(empty);
  assert.equal(e.lotOf(1).frontage, 0);
  assert.equal(e.lotOf(1).facing, false);
});

test("a lot is the rectangle in metres inset by its zone's setback, and a 2×1 shop has two bays", () => {
  const state = blank();
  pave(state, row(0, 0, 7));
  place(state, { id: 1, x: 2, y: 1, w: 2, h: 1, zone: 2 });
  const m = createModel(state);
  const lot = m.lotOf(1);
  assert.equal(lot.x0, 2 * T);   // commercial setback is 0
  assert.equal(lot.x1, 4 * T);
  assert.equal(lot.frontage, 0);
  assert.equal(lot.frontageLen, 2 * T);
  assert.equal(lot.bays, Math.round(2 * T / DEFAULTS.lot.bayW.commercial));
  assert.equal(m.surfaceAt(3 * T, 1.5 * T).kind, "lot");
  assert.equal(m.lotAt(3 * T, 1.5 * T), lot);
});

test("a building is seated on the lowest of its corners", () => {
  const state = blank();
  slope(state);
  place(state, { id: 1, x: 3, y: 3, w: 2, h: 2, zone: 1 });
  const m = createModel(state);
  const lot = m.lotOf(1);
  const corners = [[lot.x0, lot.z0], [lot.x1, lot.z0], [lot.x0, lot.z1], [lot.x1, lot.z1]].map(([x, z]) => m.heightAt(x, z));
  assert.equal(lot.seat, Math.min(...corners));
  assert.ok(lot.seat < Math.max(...corners), "the slope makes the corners differ");
});

// --- parameters --------------------------------------------------------------

test("building parameters are a function of the record and its id, and agree with the kit's formula", () => {
  const palette = PALETTES.plain;
  const b = { id: 42, zone: 1, x: 1, y: 1, w: 1, h: 1, owner: 1, level: 2, valueTier: 1 };
  const a = buildingParams(b, palette, 0xefc9a4);
  const again = buildingParams({ ...b }, palette, 0xefc9a4);
  assert.deepEqual(a, again);
  assert.equal(a.variant, Math.floor(pseudo(42 * 7 + 3) * VARIANTS) % VARIANTS);
  assert.equal(a.kind, "residential");
  assert.ok(palette.roof.house.length > 0);
  assert.ok(a.lawn !== 0, "a house stands on a garden");
  assert.equal(buildingParams({ ...b, zone: 2 }, palette, 0x8fd0f0).lawn, 0, "a shop does not");
  assert.equal(a.height, unitHeight(b));
  assert.equal(a.storeys, storeys(b));
});

test("ownership overrides the individual: family colour and a darkened roof", () => {
  const b = { id: 5, zone: 3, x: 0, y: 0, w: 1, h: 1, owner: 2, level: 1, valueTier: 0 };
  const owned = buildingParams(b, PALETTES.plain, 0xd33636, true);
  assert.equal(owned.colour, 0xd33636);
  assert.ok(owned.roof < 0xd33636, "the roof is darker than the seat colour");
});

test("height and storeys grow together with development level", () => {
  let lastH = 0;
  let lastS = 0;
  for (let level = 0; level <= 3; level += 1) {
    const b = { id: 11, zone: 2, x: 0, y: 0, w: 1, h: 1, owner: 1, level, valueTier: 1 };
    assert.ok(unitHeight(b) > lastH);
    assert.ok(storeys(b) > lastS);
    lastH = unitHeight(b); lastS = storeys(b);
  }
});

test("the hashes are stable and spread", () => {
  for (const n of [0, 1, 2, 999, 123456]) assert.equal(jitter(n, 7), jitter(n, 7));
  const values = new Set();
  for (let i = 0; i < 500; i += 1) values.add(Math.floor(jitter(i, 3) * 16));
  assert.ok(values.size >= 15, "jitter collapses onto a few buckets");
  assert.notEqual(jitter(3, 1), jitter(3, 2), "the salt does nothing");
});

test("setConfig changes the frame for the next model", () => {
  setConfig({ tileM: 10 });
  const state = blank();
  pave(state, row(3, 1, 3));
  assert.equal(createModel(state).corridors[0].length, 20);
  setConfig({});
  assert.equal(getConfig().tileM, 20);
  assert.equal(DIR4.length, 4);
});
