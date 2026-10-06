// Where a bridge's parapet and piers go (slice S18a).
//
// S13 made the deck: the carriageway stands `road.deckClearance` over the water
// and a girder hangs under its kerb. What a crossing still has not got is the
// two things that say "bridge" from a bank — a parapet along each side and
// piers standing in the water — and the item has asked for them since Q145.
//
// Pure in `(points, levels, beds, cfg)`: no three, no DOM, no clock, so the
// decision can be tested without a renderer (ruling 032).

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../client/world/config.js";
import { bridgeParts, PIER_EVERY } from "../client/world/bridge.js";

/** A straight run of N points, `water` of them over a river. */
function crossing(n = 9, from = 2, to = 6) {
  const points = [];
  const levels = [];
  const beds = [];
  for (let i = 0; i < n; i += 1) {
    points.push({ x: i * DEFAULTS.tileM, z: 0 });
    const wet = i >= from && i <= to;
    levels.push(wet ? 10 : undefined);
    beds.push(wet ? 4 : 12);
  }
  return { points, levels, beds };
}

test("a crossing has a parapet along each side, and dry road has none", () => {
  const { points, levels, beds } = crossing();
  const parts = bridgeParts(points, levels, beds, DEFAULTS, 20);
  const rails = parts.filter((p) => p.kind === "parapet");
  assert.equal(rails.length, 2, `a bridge with ${rails.length} parapet(s)`);
  for (const rail of rails) {
    assert.ok(rail.points.length >= 3, "a parapet that does not span the water");
    // It stands ON the deck, which is the clearance above the water.
    for (const p of rail.points) {
      assert.ok(p.y > 10 + DEFAULTS.road.deckClearance - 0.5, "a parapet under the deck it stands on");
    }
    assert.ok(rail.height >= 0.9 && rail.height <= 1.4, `a parapet ${rail.height} m high`);
  }
  // The two run either side of the carriageway, not down the middle.
  const [a, b] = rails;
  assert.ok(Math.abs(a.points[0].z - b.points[0].z) > 6, "both parapets are on the same side");

  const dry = bridgeParts(crossing(9, 99, 99).points, crossing(9, 99, 99).levels,
    crossing(9, 99, 99).beds, DEFAULTS, 20);
  assert.deepEqual(dry, [], "a road on dry land grew a parapet");
});

test("piers stand in the water and reach the bed", () => {
  const { points, levels, beds } = crossing(13, 3, 10);
  const piers = bridgeParts(points, levels, beds, DEFAULTS, 20).filter((p) => p.kind === "pier");
  assert.ok(piers.length >= 2, `a ${8 * DEFAULTS.tileM} m span on ${piers.length} pier(s)`);
  for (const pier of piers) {
    assert.ok(pier.y0 <= 4.01, "a pier that stops above the riverbed");
    assert.ok(pier.y1 > 10, "a pier that does not reach the deck");
    assert.ok(pier.w > 0.8 && pier.w < 4, `a pier ${pier.w} m thick`);
  }
  // Spaced, not one per point: a pier every tile is a wall across the river.
  const gaps = piers.slice(1).map((p, i) => Math.hypot(p.x - piers[i].x, p.z - piers[i].z));
  for (const gap of gaps) {
    assert.ok(gap >= PIER_EVERY * DEFAULTS.tileM - 0.01, `piers ${gap} m apart`);
  }
});

test("a one-tile ford gets a parapet and no pier", () => {
  // The narrowest crossing: a parapet is what makes it read as a bridge, and a
  // pier in a stream a car could step over is a column in a puddle.
  const { points, levels, beds } = crossing(7, 3, 3);
  const parts = bridgeParts(points, levels, beds, DEFAULTS, 20);
  assert.ok(parts.some((p) => p.kind === "parapet"), "a one-tile crossing with no parapet");
  assert.equal(parts.filter((p) => p.kind === "pier").length, 0, "a pier in a one-tile stream");
});

test("the decision is pure", () => {
  const { points, levels, beds } = crossing();
  const once = JSON.stringify(bridgeParts(points, levels, beds, DEFAULTS, 20));
  assert.equal(JSON.stringify(bridgeParts(points, levels, beds, DEFAULTS, 20)), once);
});

test("a parapet follows a crossing that bends", () => {
  // The rail's offset is perpendicular to the LINE, taken from the neighbouring
  // points — not a fixed axis. A straight-run test cannot tell those apart, and
  // a corridor that bends over its water is what the deputy lays on a river
  // that is not square to the grid.
  const points = [];
  const levels = [];
  const beds = [];
  for (let i = 0; i < 9; i += 1) {
    // A quarter turn through the crossing.
    const t = i / 8;
    points.push({ x: Math.cos(t * Math.PI / 2) * 120, z: Math.sin(t * Math.PI / 2) * 120 });
    const wet = i >= 3 && i <= 6;
    levels.push(wet ? 10 : undefined);
    beds.push(wet ? 4 : 12);
  }
  const rails = bridgeParts(points, levels, beds, DEFAULTS, 6).filter((p) => p.kind === "parapet");
  assert.equal(rails.length, 2);
  // Every rail point is its half-width from the centre line it belongs to — on
  // a bend that is only true if the offset turns with the line.
  for (const rail of rails) {
    for (let k = 0; k < rail.points.length; k += 1) {
      const centre = points[k + Math.max(0, 3 - 1)];
      if (!centre) continue;
      const d = Math.hypot(rail.points[k].x - centre.x, rail.points[k].z - centre.z);
      assert.ok(d > 3 && d < 12, `a rail point ${d.toFixed(1)} m from its centre line`);
    }
  }
});
