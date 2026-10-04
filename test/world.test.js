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
import { repoRoot, jsFilesIn } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt, DIR4 } from "../shared/grid.js";
import { NET_PRESENT, NET_AVENUE } from "../client/constants-mirror.js";
import { TERRAIN_WATER } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { streaksAround, anchorFor, rainsAt } from "../client/world/rain.js";
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

/**
 * Numbers in the renderer's config that NOTHING reads, each with the reason it
 * is still in the file. The same allow-list shape `UNREAD_RULES` uses for the
 * ruleset and `UNREAD_FIELDS` for the catalogue — three data files, one rule:
 * a number nobody reads looks exactly like a rule somebody implemented, and the
 * next slice copies it.
 *
 * Empty, and it should stay that way: P75 found a dead `rain` block by hand and
 * P91 found `airport.radarSpan` an hour after writing it (the radar's geometry
 * had the span as a literal). This is what makes the sweep a test rather than a
 * thing somebody remembers to run.
 */
const UNREAD_CONFIG = {};

test("every number in the renderer's config is read by something", () => {
  // A leaf is READ if its name appears, as a whole word and outside a comment,
  // anywhere in client/, engine/ or shared/ — `config.js` itself excepted,
  // since it is the mirror. Deliberately lenient about HOW: several blocks are
  // indexed by a computed key (`tiers[name]`, `presets[hour]`).
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8"));
  const source = [...jsFilesIn("client"), ...jsFilesIn("engine"), ...jsFilesIn("shared")]
    .filter((f) => !f.path.endsWith("config.js"))
    .map((f) => f.source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""))
    .join("\n");
  const dead = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) return;
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        if (key.startsWith("_") || key === "note") continue;
        walk(value[key], [...path, key]);
      }
      return;
    }
    const leaf = path[path.length - 1];
    if (!new RegExp(`(?<![A-Za-z0-9_])${leaf}(?![A-Za-z0-9_])`).test(source)) dead.push(path.join("."));
  };
  walk(file, []);
  const unexplained = dead.filter((key) => !Object.hasOwn(UNREAD_CONFIG, key));
  assert.deepEqual(unexplained, [],
    `config numbers nothing reads, and no entry in UNREAD_CONFIG: ${unexplained.join(", ")}`);
  for (const key of Object.keys(UNREAD_CONFIG)) {
    assert.ok(dead.includes(key), `${key} is read now — take it off UNREAD_CONFIG`);
  }
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

test("an avenue is a wider corridor, and a run that changes kind is two of them", () => {
  // The kind bit is the engine's (T1a); what the renderer does with it is the
  // cross-section — and a corridor has ONE width from end to end, because it
  // is what the ribbon is built at, what a lot fronts and what the lane
  // offsets are measured from. So an avenue that stops halfway along a street
  // has to end one corridor and start another (T1b).
  const state = blank(10);
  pave(state, column(4, 1, 8));
  for (const [x, y] of column(4, 1, 4)) state.tiles.road[tileAt(state.width, x, y)] |= NET_AVENUE;
  const m = createModel(state);
  assert.equal(m.corridors.length, 2);
  const avenue = m.corridors.find((c) => c.avenue);
  const street = m.corridors.find((c) => !c.avenue);
  assert.ok(avenue && street, "the two kinds did not come out as two corridors");
  assert.equal(avenue.half, DEFAULTS.road.avenue.width / 2);
  assert.equal(avenue.lanes, DEFAULTS.road.avenue.lanes);
  assert.equal(avenue.median, DEFAULTS.road.avenue.median);
  assert.equal(street.half, DEFAULTS.road.width / 2);
  assert.equal(street.lanes, DEFAULTS.road.lanes);
  assert.equal(street.median, 0);
  assert.ok(avenue.frontage > street.frontage, "a wider road has a further frontage");
  // The pavement and the verge live in the same twenty-metre tile as the
  // carriageway: an avenue that does not fit is one drawn over its own lots.
  assert.ok(avenue.frontage <= T / 2, `an avenue's frontage is ${avenue.frontage} m of a ${T / 2} m half tile`);

  // The seam is the first AVENUE tile, and the node there is as wide as the
  // widest street at it — the junction box, the heads and the ground's flatten
  // all step out from the middle of a node.
  const seam = m.nodes.find((n) => n.kind === "seam");
  assert.ok(seam, "no seam where the avenue ends");
  assert.equal(seam.tile, tileAt(state.width, 4, 4));
  assert.equal(seam.half, avenue.half);
  assert.equal(seam.degree, 2);
  for (const node of m.nodes) assert.ok(node.half > 0, `node ${node.id} has no width`);

  // And a street with no kind bit anywhere is exactly what it was before T1.
  const plain = blank(10);
  pave(plain, column(4, 1, 8));
  const p = createModel(plain);
  assert.equal(p.corridors.length, 1);
  assert.equal(p.corridors[0].half, DEFAULTS.road.width / 2);
  assert.equal(p.nodes.filter((n) => n.kind === "seam").length, 0);
});

test("a walker on an avenue is on the carriageway where a street's pavement would be", () => {
  // `surfaceAt` used one global half-width. On a fourteen-metre avenue that
  // puts the kerb four metres from the middle of the road, which is a walker
  // standing on the pavement in the second lane (T1b).
  const state = blank(10);
  pave(state, column(4, 1, 8));
  for (const [x, y] of column(4, 1, 8)) state.tiles.road[tileAt(state.width, x, y)] |= NET_AVENUE;
  const m = createModel(state);
  const cx = 4.5 * T;
  const cz = 4.5 * T;
  assert.equal(m.surfaceAt(cx + 5, cz).kind, "road", "five metres out is still the carriageway");
  assert.equal(m.surfaceAt(cx + 8, cz).kind, "sidewalk");
  assert.equal(m.surfaceAt(cx + 9.4, cz).kind, "sidewalk", "the pavement reaches to nine and a half metres");
  assert.equal(m.surfaceAt(cx + 9.6, cz).kind, "ground", "and stops there, inside the tile");
});

test("nodeKind reads a mask the way the road renderer does", () => {
  assert.equal(nodeKind(5), "");
  assert.equal(nodeKind(10), "");
  assert.equal(nodeKind(3), "bend");
  assert.equal(nodeKind(1), "end");
  assert.equal(nodeKind(0), "isolated");
  assert.equal(nodeKind(7), "junction");
});

test("surfaceAt puts the pavement a kerb above the carriageway (slice E3)", () => {
  const state = blank();
  pave(state, row(3, 1, 6));
  const model = createModel(state);
  const cz = 3.5 * T;
  const road = model.surfaceAt(3.5 * T, cz);
  const walk = model.surfaceAt(3.5 * T, cz + DEFAULTS.road.width / 2 + 1);
  assert.equal(road.kind, "road");
  assert.equal(walk.kind, "sidewalk");
  // The carriageway sits `lift` above the field and the pavement a kerb above
  // that — the step E4's walker has to climb, and the reason a walker reading
  // `heightAt` alone would stand inside the kerb it can see.
  assert.ok(Math.abs(walk.y - road.y - DEFAULTS.road.kerb) < 1e-6, `${walk.y} vs ${road.y}`);
  assert.ok(road.y > model.heightAt(3.5 * T, cz));
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

// --- streets graded along their length (slice R3, A42) -----------------------

test("heightAt inside a road follows the STREET, not the hill under it", () => {
  // The whole of R3 in one assertion. `heightAt` used to return the land at the
  // nearest point on the centre line, so a road went wherever the hill went;
  // it reads the corridor's graded profile now.
  const state = blank();
  // A cliff halfway along a north-south street: four flat tiles, then a step.
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      state.tiles.elevation[tileAt(state.width, x, y)] = y < 4 ? 0 : 40;
    }
  }
  pave(state, column(4, 0, 7));
  const m = createModel(state);
  const cx = 4.5 * T;
  let worst = 0;
  for (let z = 0.5 * T; z + 2 <= 7.5 * T; z += 2) {
    worst = Math.max(worst, Math.abs(m.heightAt(cx, z + 2) - m.heightAt(cx, z)) / 2);
  }
  // The land itself steps 20 m in one tile — 100% — and the graded street has
  // to be a great deal less than that. It cannot be the limit exactly: the two
  // junctions at the ends are fixed at the land's height (A42), and this
  // fixture's are 20 m apart vertically over 140 m.
  assert.ok(worst < 0.25, `the street still climbs at ${(worst * 100).toFixed(0)}%`);
  assert.ok(worst > 0.05, "the street was flattened rather than graded");
});

test("a graded street still climbs the hill", () => {
  const state = blank();
  slope(state);
  pave(state, row(4, 0, 7));   // an east-west road up an east-rising slope
  const m = createModel(state);
  const cz = 4.5 * T;
  assert.ok(m.heightAt(7.5 * T, cz) - m.heightAt(0.5 * T, cz) > 5,
    "the street was levelled into a terrace");
});

test("the junction box at each end of a street is level", () => {
  // Node heights being fixed is only half of it: a street still climbing where
  // it enters a junction gets dragged up by the blend to meet the street
  // crossing it, and that drag was 35.5 of the field's worst 37.1% (R3).
  const state = blank();
  slope(state);
  pave(state, row(4, 0, 7));
  const m = createModel(state);
  const cz = 4.5 * T;
  const box = DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk;
  const [west, east] = [...m.nodes].sort((a, b) => a.x - b.x);
  // Into the street from each end, not out of the map.
  for (const [node, into] of [[west, 1], [east, -1]]) {
    const near = m.heightAt(node.x + into * 0.25, cz);
    const edge = m.heightAt(node.x + into * box, cz);
    assert.ok(Math.abs(near - edge) < 0.05,
      `the junction box at ${node.x} tilts by ${(near - edge).toFixed(2)} m over ${box} m`);
  }
});

test("every corridor reports the grade it ended up with", () => {
  const state = blank();
  slope(state);
  pave(state, row(4, 0, 7));
  const m = createModel(state);
  for (const c of m.corridors) {
    const p = m.profileOf(c.id);
    assert.ok(p, `corridor ${c.id} has no profile`);
    assert.ok(Number.isFinite(p.steepest), `${p.steepest}`);
  }
  assert.ok(Number.isFinite(m.steepestStreet));
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

// --- the railway (T3) --------------------------------------------------------

test("a rail mask makes its own corridors, at the rail's width and with no pavement", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9));
  for (const [x, y] of column(6, 1, 9)) state.tiles.rail[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of column(6, 1, 9)) {
    state.tiles.rail[tileAt(state.width, x, y)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, y, (i) => (state.tiles.rail[i] & NET_PRESENT) !== 0);
  }
  const m = createModel(state);

  // The road network does not know the line exists, and the line does not know
  // about the road: a level crossing is one tile carrying two networks, not a
  // junction between them.
  assert.equal(m.corridors.length, 1, "the road network grew a rail corridor");
  assert.equal(m.rail.corridors.length, 1);
  const line = m.rail.corridors[0];
  assert.equal(line.kind, "rail");
  assert.equal(line.half, DEFAULTS.rail.width / 2);
  assert.equal(line.frontage, line.half, "a railway grew a pavement");
  assert.equal(line.lanes, 1);
  assert.equal(line.avenue, false);
  assert.equal(line.tiles.length, 9);

  // And the crossing tile is on both, which is the one thing that makes this
  // different from a fourth road (A66).
  const crossing = tileAt(state.width, 6, 4);
  assert.ok(m.corridors[0].tiles.includes(crossing), "the road does not cross the line");
  assert.ok(line.tiles.includes(crossing), "the line does not cross the road");
});

test("a map with no rail on it derives an empty railway rather than nothing", () => {
  const state = blank(10);
  pave(state, row(4, 2, 8));
  const m = createModel(state);
  assert.deepEqual(m.rail.corridors, []);
  assert.deepEqual(m.rail.nodes, []);
  // And a walker is not standing on a railway that is not there.
  assert.equal(m.surfaceAt(4.5 * T, 4.5 * T).kind, "road");
});

// --- the rain (Q112, A115) ------------------------------------------------------

test("the rain falls around the EYE, in tiles, and keeps falling", () => {
  // B6's streaks were placed at the centre of the visible bounds — which at a
  // low pitch is past the map's edge — and then at `eyeOf`, which for a city
  // camera is twelve hundred units out along the orbit. Both were invisible for
  // the same reason, and neither was visible as a defect from inside three.
  const spec = { count: 40, radius: 6, height: 8, length: 0.4, period: 0.9 };
  const eye = { x: 20, y: 2, z: 30 };
  const now = streaksAround(eye, 0, spec);
  assert.equal(now.length, spec.count);
  for (const s of now) {
    assert.ok(Math.hypot(s.x - eye.x, s.z - eye.z) <= spec.radius + 1e-9, "a streak is outside the column");
    assert.ok(s.y >= eye.y - spec.length && s.y <= eye.y + spec.height, `a streak is at ${s.y}`);
  }
  // It falls: the same streak is lower a moment later, and it wraps rather than
  // running out.
  const later = streaksAround(eye, spec.period * 0.25, spec);
  assert.ok(later.some((s, i) => s.y < now[i].y), "nothing moved down");
  const wrapped = streaksAround(eye, spec.period, spec);
  for (let i = 0; i < wrapped.length; i += 1) {
    assert.ok(Math.abs(wrapped[i].y - now[i].y) < 1e-6, "the column does not wrap at its own period");
  }
  // And it travels with the eye rather than staying where it was.
  const moved = streaksAround({ x: 40, y: 2, z: 30 }, 0, spec);
  assert.ok(Math.abs((moved[0].x - now[0].x) - 20) < 1e-9, "the column did not travel with the eye");
});

test("the rain's column stands where the camera is LOOKING, not where its eye is", () => {
  // A city camera's eye is out on an orbit — B6 put the rain there, and the
  // streaks fell twelve hundred tiles from the city. On foot the eye IS where
  // you are, so the two answers are different questions rather than a constant.
  const far = { mode: "city", targetX: 30, targetZ: 40, groundY: 1.2 };
  const eye = { x: 1200, y: 400, z: 1200 };
  assert.deepEqual(anchorFor(far, eye), { x: 30, y: 1.2, z: 40 });
  const walking = { mode: "street", targetX: 0, targetZ: 0 };
  assert.deepEqual(anchorFor(walking, { x: 5, y: 1.7, z: 6 }), { x: 5, y: 1.7, z: 6 });
});

test("the rain is drawn on foot and not from the air (Q112, A115)", () => {
  // A streak is half a metre long. At eighteen pixels a tile that is nothing,
  // and what weather looks like from up there is the flat light and the fog
  // B6a already ships — so the city camera draws the hour and not 1,400
  // triangles of rain it cannot resolve.
  assert.equal(rainsAt({ mode: "street" }), true);
  assert.equal(rainsAt({ mode: "photo" }), true);
  assert.equal(rainsAt({ mode: "city" }), false);
  assert.equal(rainsAt({ mode: "ortho" }), false);
  assert.equal(rainsAt(undefined), false);
});

// --- the railway's own profile (Q120, A118) ---------------------------------------

test("a line is graded within rail.maxGrade, and the ground does not move", () => {
  // R3's grading is keyed to the ROAD network, so a rail corridor followed the
  // terrain: on `hilly` the track climbed gradients no train could take. It has
  // its own profile now — and NOT in the height field, because the field is
  // what every lot, lane, prop and walker reads.
  const size = 24;
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  // A hillside: four elevation steps a tile is 2 m over 20, which is 10% — far
  // past a railway's four per cent and inside a road's fifteen.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) state.tiles.elevation[tileAt(size, x, y)] = 40 + x * 4;
  }
  const rail = state.tiles.rail;
  for (let x = 2; x <= 20; x += 1) rail[tileAt(size, x, 10)] = NET_PRESENT;
  for (let x = 2; x <= 20; x += 1) {
    rail[tileAt(size, x, 10)] = NET_PRESENT | adjacencyMask(size, size, x, 10, (i) => (rail[i] & NET_PRESENT) !== 0);
  }
  const m = createModel(state);
  assert.equal(m.rail.corridors.length, 1, "the line is not one corridor");
  const corridor = m.rail.corridors[0];
  const profile = m.railProfileOf(corridor.id);
  assert.ok(profile, "the line has no profile");
  assert.ok(profile.steepest <= DEFAULTS.rail.maxGrade + 1e-6,
    `the line climbs ${(profile.steepest * 100).toFixed(1)}% against a limit of ${(DEFAULTS.rail.maxGrade * 100).toFixed(0)}%`);

  // The track stands clear of the land it crosses: a cutting at one end and an
  // embankment at the other, which is what a graded line IS.
  let worstFill = 0;
  let worstCut = 0;
  for (const p of corridor.points) {
    const d = m.railHeightAt(p.x, p.z) - m.landAt(p.x, p.z);
    if (d > worstFill) worstFill = d;
    if (-d > worstCut) worstCut = -d;
  }
  assert.ok(worstFill > 1 && worstCut > 1,
    `the line hugs the ground: ${worstFill.toFixed(1)} m of fill and ${worstCut.toFixed(1)} m of cutting`);

  // And the GROUND is the ground: the height field under the line is what it
  // would be with no line there at all.
  const bare = createModel({ ...state, tiles: { ...state.tiles, rail: new Uint8Array(state.tiles.rail.length) } });
  for (const p of corridor.points) {
    assert.ok(Math.abs(m.heightAt(p.x, p.z) - bare.heightAt(p.x, p.z)) < 1e-9,
      "the railway moved the height field");
  }
});
