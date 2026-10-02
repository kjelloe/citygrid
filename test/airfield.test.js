// The airfield's ground plan (slice T5b; ruling 044).
//
// The airport is the first building whose own ORIENTATION means something, and
// the plan is where that fact lives: a runway runs along the footprint's long
// axis, which is NOT the rotation every other civic building takes. Those two
// could not disagree before this slice, because every other footprint is square
// or near enough — so the test that matters is the pair of aspects, not one.
//
// Pure, so it is tested here rather than in a screenshot: node cannot import
// anything that imports three, and a runway drawn across its own short side is
// exactly the kind of defect a picture gate reports as "ok, 1 airport".

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { airfieldOf, BANDS } from "../client/world/airfield.js";
import { DEFAULTS } from "../client/world/config.js";

const TILE = DEFAULTS.tileM;
const spec = DEFAULTS.airport;

/** An airport's building record, as `placeBuilding` writes it (T5a): the
 * orientation is SPENT into w and h, so these two are the two orientations. */
const wide = { id: 1, def: "airport", x: 10, y: 20, w: 6, h: 4 };
const tall = { id: 2, def: "airport", x: 10, y: 20, w: 4, h: 6 };

const lot = (b) => ({
  x0: b.x * TILE, z0: b.y * TILE, x1: (b.x + b.w) * TILE, z1: (b.y + b.h) * TILE,
});
const inside = (r, box) => r.x0 >= box.x0 - 1e-9 && r.x1 <= box.x1 + 1e-9
  && r.z0 >= box.z0 - 1e-9 && r.z1 <= box.z1 + 1e-9;
const longSide = (r) => Math.max(r.x1 - r.x0, r.z1 - r.z0);

test("only an airport has an airfield", () => {
  assert.equal(airfieldOf({ def: "coalPlant", x: 1, y: 1, w: 3, h: 3 }), undefined);
  assert.equal(airfieldOf(undefined), undefined);
  assert.ok(airfieldOf(wide));
});

test("the runway runs along the FOOTPRINT's long axis, both ways round", () => {
  const a = airfieldOf(wide);
  const b = airfieldOf(tall);
  assert.equal(a.axis, "x");
  assert.equal(b.axis, "z");
  // Six tiles of runway either way, not six on one and four on the other.
  assert.equal(Math.round(a.runway.x1 - a.runway.x0), Math.round(b.runway.z1 - b.runway.z0));
  assert.ok(a.runway.x1 - a.runway.x0 > a.runway.z1 - a.runway.z0, "the wide airport's runway is short");
  assert.ok(b.runway.z1 - b.runway.z0 > b.runway.x1 - b.runway.x0, "the tall airport's runway is short");
});

test("the plan does not take the frontage, which is a different rotation", () => {
  // Ruling 044: an orientable definition carries its own rotation in its
  // footprint. `airfieldOf` has no frontage argument at all — this asserts the
  // SHAPE of that decision, because a plan that took one would turn a 6×4
  // runway onto a 4-tile side the moment the lot fronted a side street.
  assert.equal(airfieldOf.length, 1, "airfieldOf takes something besides the building");
});

test("nothing in the plan leaves the footprint", () => {
  for (const b of [wide, tall]) {
    const plan = airfieldOf(b);
    const box = lot(b);
    for (const [name, r] of [["runway", plan.runway], ["apron", plan.apron], ["taxiway", plan.taxiway]]) {
      assert.ok(inside(r, box), `${name} leaves the lot: ${JSON.stringify(r)} of ${JSON.stringify(box)}`);
    }
    for (const m of plan.marks) assert.ok(inside(m, box), `a marking leaves the lot: ${JSON.stringify(m)}`);
    for (const l of plan.lights) {
      assert.ok(l.x >= box.x0 && l.x <= box.x1 && l.z >= box.z0 && l.z <= box.z1,
        `a light is outside the lot: ${JSON.stringify(l)}`);
    }
  }
});

test("the runway and the apron do not overlap", () => {
  // They are two bands across the short axis. An apron drawn over the runway is
  // a plane taxiing through a landing one, and at this zoom it reads as one
  // slab of grey — which is what the aerial shot of T5a's two slabs showed.
  for (const b of [wide, tall]) {
    const { runway, apron } = airfieldOf(b);
    const overlap = Math.min(runway.x1, apron.x1) - Math.max(runway.x0, apron.x0) > 1e-9
      && Math.min(runway.z1, apron.z1) - Math.max(runway.z0, apron.z0) > 1e-9;
    assert.equal(overlap, false, `${b.w}×${b.h}: the apron is on the runway`);
  }
});

test("the centreline is dashed and the thresholds are barred", () => {
  const plan = airfieldOf(wide);
  const dashes = plan.marks.filter((m) => m.kind === "dash");
  const bars = plan.marks.filter((m) => m.kind === "threshold");
  assert.ok(dashes.length >= 3, `${dashes.length} centreline dashes`);
  assert.equal(bars.length, 2 * spec.thresholdBars, `${bars.length} threshold bars`);
  // Dashed means GAPS: consecutive dashes do not touch.
  const along = dashes.map((d) => d.x0).sort((a, b) => a - b);
  for (let i = 1; i < along.length; i += 1) {
    assert.ok(along[i] - along[i - 1] > spec.dashM, `two dashes ${along[i] - along[i - 1]} m apart`);
  }
  // And every mark is ON the runway, not beside it.
  for (const m of plan.marks) assert.ok(inside(m, plan.runway), `a mark is off the runway: ${m.kind}`);
});

test("the thresholds are the two ends of the runway, and the plane uses them", () => {
  for (const b of [wide, tall]) {
    const plan = airfieldOf(b);
    assert.equal(plan.line.length, 2);
    const [a, c] = plan.line;
    assert.ok(Math.hypot(a.x - c.x, a.z - c.z) > longSide(plan.runway) * 0.8,
      "the centreline is shorter than the runway it lies on");
    // Both ends are on the runway's centre across the short axis.
    const mid = plan.axis === "x" ? (plan.runway.z0 + plan.runway.z1) / 2 : (plan.runway.x0 + plan.runway.x1) / 2;
    const across = (p) => (plan.axis === "x" ? p.z : p.x);
    assert.ok(Math.abs(across(a) - mid) < 1e-9 && Math.abs(across(c) - mid) < 1e-9,
      "a threshold is off the centreline");
  }
});

test("the apron is lit, at about the spacing the data asks for", () => {
  const plan = airfieldOf(wide);
  assert.ok(plan.lights.length >= 4, `${plan.lights.length} apron lights`);
  const sorted = plan.lights.map((l) => (plan.axis === "x" ? l.x : l.z)).sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i]).filter((g) => g > 1e-6);
  for (const g of gaps) {
    assert.ok(Math.abs(g - spec.lightSpacingM) < spec.lightSpacingM, `lights ${g} m apart`);
  }
});

test("the bands are the ones the silhouette is built from", () => {
  // One layout, two readers (E5's rule): `civic-spec.js` authors the airport's
  // L2 slabs from these same bands, so the block a player sees at city zoom and
  // the asphalt they walk on at street level cannot drift apart.
  const source = readFileSync(join(repoRoot, "client", "world", "civic-spec.js"), "utf8");
  assert.match(source, /BANDS/, "civic-spec does not read the airfield's bands");
  for (const name of ["runway", "apron", "terminal"]) {
    assert.ok(BANDS[name], `no ${name} band`);
    assert.ok(BANDS[name].z1 > BANDS[name].z0, `${name} is inside out`);
    assert.ok(BANDS[name].z0 >= -1 && BANDS[name].z1 <= 1, `${name} leaves unit space`);
  }
});

// --- what the baker gets ------------------------------------------------------

test("the L3 pass turns the plan into asphalt, paint and lamps", async () => {
  // `client/render/airport-l3.js` never imports three, deliberately, so the
  // thing that actually feeds the baker can be measured here rather than
  // counted in a screenshot — where an empty pass and a pass hidden under
  // something else look identical.
  const { buildAirfield } = await import("../client/render/airport-l3.js");
  const box = { x0: 0, z0: 0, x1: 4000, z1: 4000 };
  const built = buildAirfield({
    buildings: [wide], heightAt: () => 7, palette: { road: 1, roadMark: 2, civic: 3 },
    box, cfg: DEFAULTS,
  });
  assert.equal(built.fields, 1, "the airfield was not built");
  const triangles = built.pieces.reduce((n, p) => n + p.part.triangles, 0);
  assert.ok(triangles >= 2 * (3 + spec.thresholdBars * 2), `${triangles} triangles of asphalt and paint`);
  assert.equal(built.pieces.length, 3, "asphalt, apron and paint are not three pieces");
  assert.ok(built.lamps.length >= 4, `${built.lamps.length} apron lamps`);
  for (const lamp of built.lamps) assert.ok(lamp.y > 7, "a lamp is on the ground rather than on a mast");
});

test("an airfield outside the chunk is not baked into it", async () => {
  // Every chunk would otherwise carry every airport in the region.
  const { buildAirfield } = await import("../client/render/airport-l3.js");
  const far = buildAirfield({
    buildings: [wide], heightAt: () => 0, palette: { road: 1, roadMark: 2, civic: 3 },
    box: { x0: 3000, z0: 3000, x1: 4000, z1: 4000 }, cfg: DEFAULTS,
  });
  assert.equal(far.fields, 0);
  assert.deepEqual(far.pieces, []);
  assert.deepEqual(far.lamps, []);
});
