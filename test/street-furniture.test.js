// Street furniture, and the fact that you can walk into it (slice E7; A43).
//
// Lamps and hedges were geometry and nothing else: a lamp post was a picture of
// a lamp post, and the walker went straight through it. A43 makes them solid,
// which means the placement has to move OUT of `client/render/` — the collision
// world is in `client/world/` and may not import a renderer module — and it
// means the placement itself is now load-bearing rather than decorative.
//
// The finding this file exists for: a lamp in the middle of the pavement is a
// lamp in the middle of where the walker walks. It was at `half + sidewalk / 2`,
// which is exactly the line `walkthrough` walks, so every leg on a pavement
// ground to a halt on a post every 24 m. It stands `lampInset` out from the
// kerb now.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import {
  lampsAlong, lampOffset, hedgeSpans, furnitureBoxes, POST_HALF, HEDGE_HALF,
} from "../client/world/street-furniture.js";

setConfig(DEFAULTS);

const line = (n = 10, step = 10) => {
  const pts = [];
  for (let i = 0; i < n; i += 1) pts.push({ x: i * step, z: 0 });
  return pts;
};
const flat = () => 0;

test("lamps march along a corridor at the spacing the data asks for", () => {
  const cfg = getConfig();
  const out = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  assert.ok(out.length >= 3, `${out.length} lamps over 90 m`);
  for (let i = 1; i < out.length; i += 1) {
    const d = Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    // Alternating sides, so consecutive lamps are a spacing apart along the
    // street and twice the offset across it.
    assert.ok(Math.abs(d - Math.hypot(cfg.props.lampSpacing, 2 * lampOffset(cfg))) < 1e-6, `${d} m apart`);
  }
});

test("lamps alternate sides", () => {
  const cfg = getConfig();
  const out = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  for (let i = 1; i < out.length; i += 1) {
    assert.notEqual(Math.sign(out[i].z), Math.sign(out[i - 1].z), "two lamps on the same side");
  }
});

test("a lamp stands clear of the line a walker walks (A43)", () => {
  // The pavement runs from `half` to `half + sidewalk`; `walkthrough` walks its
  // middle. A 0.34 m walker on that line must not touch the post.
  const cfg = getConfig();
  const half = cfg.road.width / 2;
  const walked = half + cfg.road.sidewalk / 2;
  const offset = lampOffset(cfg);
  assert.ok(offset > half, `a lamp at ${offset} m is in the carriageway`);
  assert.ok(offset + POST_HALF < half + cfg.road.sidewalk, `a lamp at ${offset} m hangs off the kerb`);
  assert.ok(walked - (offset + POST_HALF) > 0.34,
    `only ${(walked - offset - POST_HALF).toFixed(2)} m between the post and the walked line`);
});

test("a lamp is a thin box, not a cube round its head", () => {
  const cfg = getConfig();
  const [lamp] = lampsAlong(line(2, 30), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: flat }, [lamp], []);
  assert.equal(boxes.length, 1);
  const b = boxes[0];
  assert.ok(b.x1 - b.x0 <= 0.2 && b.z1 - b.z0 <= 0.2, `a ${(b.x1 - b.x0).toFixed(2)} m post`);
  assert.ok(b.yTop - b.yBase > 2, "a walker could step over it");
});

test("a hedge leaves the gap the path goes through", () => {
  const cfg = getConfig();
  const front = { x0: 0, z0: 0, x1: 12, z1: 0 };
  const spans = hedgeSpans(front, cfg.props);
  assert.equal(spans.length, 2, "the hedge has no gate in it");
  const gap = Math.hypot(spans[1].ax - spans[0].bx, spans[1].az - spans[0].bz);
  assert.ok(gap >= cfg.props.pathW, `a ${gap.toFixed(2)} m gap for a ${cfg.props.pathW} m path`);
});

test("a frontage too short for a gate gets no hedge rather than a negative one", () => {
  const cfg = getConfig();
  const spans = hedgeSpans({ x0: 0, z0: 0, x1: 1.2, z1: 0 }, cfg.props);
  assert.deepEqual(spans, []);
});

test("the furniture boxes are seated on their own ground, not on zero", () => {
  const cfg = getConfig();
  const slope = (x) => x / 10;
  const lamps = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, slope);
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: slope }, lamps, []);
  const ys = boxes.map((b) => b.yBase);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1, "every post is at the same height on a hill");
});

test("a hedge box is thin and low — a wall you can see over and not step over", () => {
  const cfg = getConfig();
  const front = { x0: 0, z0: 0, x1: 12, z1: 0 };
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: flat }, [], [front]);
  assert.equal(boxes.length, 2);
  for (const b of boxes) {
    assert.ok(b.z1 - b.z0 <= 2 * HEDGE_HALF + 1e-9, "a hedge as thick as a room");
    assert.ok(b.yTop - b.yBase > 0.6, "a walker could step over it");
    assert.ok(b.yTop - b.yBase < 1.5, "a hedge you cannot see over is a wall");
  }
});

// --- streets with detail (S3) --------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT, FLAG_RUINED } from "../client/constants-mirror.js";
import { createModel } from "../client/world/model.js";
import { WALK_OFFSET } from "../client/world/nav.js";
import {
  STREET_NAMES, streetName, junctionProps, corridorProps, shopProps, streetProps, SOLID_PROPS, DOOR_CLEAR,
} from "../client/world/street-furniture.js";

/** A crossroads town: two long streets crossing, shops along one, houses along the other. */
function town() {
  const size = 24;
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.elevation.fill(40);
  const road = state.tiles.road;
  const tiles = [];
  for (let x = 2; x < 22; x += 1) tiles.push([x, 12]);
  for (let y = 2; y < 22; y += 1) tiles.push([12, y]);
  for (const [x, y] of tiles) road[tileAt(size, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) road[tileAt(size, x, y)] = NET_PRESENT | adjacencyMask(size, size, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  let id = 1;
  const place = (b) => {
    const building = { id: id++, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1, level: 1, valueTier: 1,
      occupancy: 30, condition: 100, builtTick: 0, flags: 0, ...b };
    state.buildings.push(building);
    state.tiles.buildingId[tileAt(size, building.x, building.y)] = building.id;
  };
  // Shops as the engine makes them: occupancy counts residents, so a shop has none.
  for (let x = 3; x < 11; x += 1) place({ x, y: 11, zone: 2, occupancy: 0 });
  place({ x: 14, y: 11, zone: 2, occupancy: 0, flags: FLAG_RUINED });             // a ruined shop
  for (let y = 3; y < 11; y += 1) place({ x: 13, y, zone: 1 });                    // houses, east of the stem
  return { state, model: createModel(state) };
}

/** Distance from a point to a polyline. */
function toLine(points, x, z) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

test("street names are data, the same list in every locale, and a function of the corridor", () => {
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "names.json"), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(STREET_NAMES)), file.streets, "the mirror drifted from names.json");
  assert.equal(STREET_NAMES.en.length, STREET_NAMES.no.length, "a language change would move a street");
  for (const id of [0, 3, 17, 400]) {
    assert.equal(streetName(id), streetName(id));
    assert.ok(STREET_NAMES.en.includes(streetName(id)));
    assert.equal(STREET_NAMES.no.indexOf(streetName(id, "no")), STREET_NAMES.en.indexOf(streetName(id)));
  }
  assert.ok(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => streetName(i))).size >= 4, "every street has one name");
});

test("a crossroads has a bollard on each pavement corner and one name sign", () => {
  const cfg = getConfig();
  const { model } = town();
  const cross = model.nodes.find((n) => n.kind === "junction" && n.degree === 4);
  const props = junctionProps(model, cross);
  assert.equal(props.filter((p) => p.kind === "bollard").length, 4);
  assert.equal(props.filter((p) => p.kind === "sign").length, 1);
  const half = cfg.road.width / 2;
  for (const p of props) {
    for (const id of cross.corridors) {
      const d = toLine(model.corridors[id].points, p.x, p.z);
      assert.ok(d >= half, `a ${p.kind} ${d.toFixed(2)} m from a centre line: in the carriageway`);
    }
  }
  const sign = props.find((p) => p.kind === "sign");
  assert.ok(STREET_NAMES.en.includes(streetName(sign.name)), "the sign names no street");
});

test("manholes are in the carriageway, drains at the kerb, and nothing in a junction box", () => {
  const cfg = getConfig();
  const half = cfg.road.width / 2;
  const { model } = town();
  for (const corridor of model.corridors) {
    const props = corridorProps(corridor);
    const ends = [corridor.points[0], corridor.points[corridor.points.length - 1]];
    for (const p of props) {
      const d = toLine(corridor.points, p.x, p.z);
      if (p.kind === "manhole") assert.ok(d < half - 0.5, `a manhole ${d.toFixed(2)} m out`);
      if (p.kind === "drain") assert.ok(d > half - 0.6 && d < half, `a drain ${d.toFixed(2)} m out, not at the kerb`);
      for (const e of ends) {
        const node = model.nodes.find((n) => Math.hypot(n.x - e.x, n.z - e.z) < 1e-6);
        if (node?.kind !== "junction") continue;
        assert.ok(Math.hypot(p.x - e.x, p.z - e.z) > half + cfg.road.sidewalk, `a ${p.kind} inside a junction box`);
      }
    }
    const long = corridor.length >= 3 * cfg.tileM;
    assert.equal(props.some((p) => p.kind === "postbox"), long, `corridor ${corridor.id} of ${corridor.length.toFixed(0)} m`);
  }
});

test("a shop has a bench, a bike rack and its bays; a house and a ruined shop have none", () => {
  const { model } = town();
  for (const lot of model.lots) {
    const { props, bays } = shopProps(lot);
    const shop = lot.building.zone === 2 && (lot.building.flags & FLAG_RUINED) === 0;
    assert.equal(props.length > 0, shop, `lot ${lot.id} (zone ${lot.building.zone}, ${lot.building.occupancy})`);
    if (!shop) assert.equal(bays.length, 0);
  }
});

test("a parking bay never covers a door, and is clear of the pavement", () => {
  // The door's path crosses the bay strip to the pavement: a car parked across
  // it is a driveway blocked.
  const cfg = getConfig();
  const { model } = town();
  const street = model.corridors.find((c) => c.points.every((p) => Math.abs(p.z - model.corridors[0].points[0].z) < 1e-6)) ?? model.corridors[0];
  let bays = 0;
  for (const lot of model.lots) {
    const shop = shopProps(lot);
    const front = Math.hypot(lot.x1 - lot.x0, lot.z1 - lot.z0);
    for (const bay of shop.bays) {
      bays += 1;
      const door = lot.frontageLen / 2;
      assert.ok(bay.u1 <= door - DOOR_CLEAR + 1e-9 || bay.u0 >= door + DOOR_CLEAR - 1e-9,
        `a bay [${bay.u0}, ${bay.u1}] across the door at ${door} on lot ${lot.id}`);
      const d = Math.min(...model.corridors.map((c) => toLine(c.points, bay.x, bay.z)));
      assert.ok(d > cfg.road.width / 2 + cfg.road.sidewalk, `a bay ${d.toFixed(2)} m from the centre line: on the pavement`);
      assert.ok(front > 0 && street);
    }
  }
  assert.ok(bays > 0, "no bays in a street of shops");
});

test("the solid props are colliders, from the same list, and a drain is not", () => {
  const { model } = town();
  const { props } = streetProps(model);
  const boxes = furnitureBoxes(model, [], [], props);
  const solid = props.filter((p) => SOLID_PROPS[p.kind]);
  assert.equal(boxes.length, solid.length);
  assert.ok(solid.some((p) => p.kind === "bench") && solid.some((p) => p.kind === "bollard"));
  for (let i = 0; i < boxes.length; i += 1) {
    assert.ok(boxes[i].x0 < solid[i].x && boxes[i].x1 > solid[i].x && boxes[i].z0 < solid[i].z && boxes[i].z1 > solid[i].z,
      `the ${solid[i].kind}'s box is not where the ${solid[i].kind} is`);
  }
  assert.equal(boxes.some((b) => b.kind === "drain" || b.kind === "manhole" || b.kind === "bikerack"), false);
});

test("no solid prop stands on the line a person walks (S3)", () => {
  // Mid-pavement is exactly where the walker walks, and the first cut put a
  // bollard there on every junction corner: `walkthrough` stopped dead.
  const cfg = getConfig();
  const walk = WALK_OFFSET(cfg);
  const { model } = town();
  for (const p of streetProps(model).props) {
    if (!SOLID_PROPS[p.kind]) continue;
    const size = SOLID_PROPS[p.kind];
    const reach = Math.max(size.hx, size.hz) + 0.35;
    for (const c of model.corridors) {
      const d = toLine(c.points, p.x, p.z);
      assert.ok(Math.abs(d - walk) > reach, `a ${p.kind} ${d.toFixed(2)} m from corridor ${c.id}: on the walking line at ${walk}`);
    }
  }
});
