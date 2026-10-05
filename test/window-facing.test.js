// What is behind a window has to face the street the window is seen from (S21).
//
// `test/facade.test.js` has asserted since E5 that "every triangle is wound the
// way its normal points" — and that test cannot fail, because `solid.js`
// computes each normal FROM its winding. What nothing asserted is the thing
// that matters: the backing panel, the curtain, the blind and the shop's back
// wall are seen through an opening from OUTSIDE, so they have to face outward.
//
// They did not, on two sides of every building in the city. `facade.js` chose
// the winding with `out[0] + out[1] > 0`, which is a test on the normal alone —
// and the quad is built from `along` AND `out`, which flip together. The east
// and south faces of every building drew their glass and their dressing facing
// into the room, where the renderer culls them: a shop with no ground floor,
// and a house whose windows are holes you can see the countryside through.
//
// So this is the claim, per side, from the geometry the builder actually
// returns — the half a node test can hold of a renderer it cannot run.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { createModel } from "../client/world/model.js";
import { facadeSpec } from "../client/world/facade-spec.js";
import { buildingParams } from "../client/world/params.js";
import { buildFacade } from "../client/render/facade.js";
import { PALETTES } from "../client/render/palettes.js";
import { EDGES, outwardQuad } from "../client/render/edges.js";
import { tileAt, adjacencyMask } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";

/** A building at (6,6) with a street on ONE side, so its frontage is that side. */
function townhouse(frontage, zone = 1) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  const road = state.tiles.road;
  // The street tile beside the building, on the side asked for.
  const at = [[6, 5], [7, 6], [6, 7], [5, 6]][frontage];
  const line = frontage % 2 === 0
    ? Array.from({ length: 12 }, (unused, i) => [2 + i, at[1]])
    : Array.from({ length: 12 }, (unused, i) => [at[0], 2 + i]);
  for (const [x, y] of line) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of line) {
    road[tileAt(state.width, x, y)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const building = {
    id: 1, def: "", zone, x: 6, y: 6, w: 1, h: 1, owner: 1,
    level: 3, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  state.tiles.buildingId[tileAt(state.width, 6, 6)] = 1;
  const model = createModel(state);
  const lot = model.lotOf(1);
  const spec = facadeSpec(lot, buildingParams(building, PALETTES.plain, 0x998877));
  return { lot, spec, pieces: buildFacade(spec) };
}

/** Every triangle of these pieces, with its normal and its centre.
 *
 * The centre is what says WHICH face a triangle is on. The first cut of this
 * test sorted by normal alone and called the far side of the building wrong —
 * a piece behind a north window and a piece behind a south window have
 * opposite normals and both are right. */
function trianglesOf(pieces, names) {
  const out = [];
  for (const piece of pieces) {
    if (!names.includes(piece.name)) continue;
    const { part } = piece;
    for (let t = 0; t < part.triangles; t += 1) {
      const i = t * 9;
      out.push({
        normal: [part.normal[i], part.normal[i + 1], part.normal[i + 2]],
        at: [
          (part.position[i] + part.position[i + 3] + part.position[i + 6]) / 3,
          (part.position[i + 1] + part.position[i + 4] + part.position[i + 7]) / 3,
          (part.position[i + 2] + part.position[i + 5] + part.position[i + 8]) / 3,
        ],
      });
    }
  }
  return out;
}

/** Is this triangle on the lot's street face? Within a metre of its plane, which
 * is deeper than the reveal and shallower than the building. */
function onStreetFace(lot, frontage, at) {
  if (frontage === 0) return Math.abs(at[2] - lot.z0) < 1;
  if (frontage === 1) return Math.abs(at[0] - lot.x1) < 1;
  if (frontage === 2) return Math.abs(at[2] - lot.z1) < 1;
  return Math.abs(at[0] - lot.x0) < 1;
}

const BEHIND_GLASS = ["glazing", "lit", "curtain", "blind", "shopShelf", "interior"];

test("one winding faces out of a wall, on all four sides", () => {
  // The rule itself, where it lives (`outwardQuad`), rather than through a
  // building: four sides, one cross product each, no renderer. This is the test
  // that would have cost ten minutes in September.
  for (const geom of EDGES) {
    const [ax, az] = geom.along;
    const [nx, nz] = geom.out;
    const depth = 0.25;
    const at = (u, y) => [ax * u - nx * depth, y, az * u - nz * depth];
    const corners = [at(1, 2), at(3, 2), at(3, 4), at(1, 4)];
    const got = [];
    outwardQuad({ quad: (a, b, c, d) => got.push(a, b, c, d) }, corners);
    const [a, b, c] = got;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    assert.ok(Math.round(n[0] / len) === nx && Math.round(n[2] / len) === nz,
      `side ${geom.side}: the quad faces (${Math.round(n[0] / len)},${Math.round(n[2] / len)}), `
      + `the wall faces (${nx},${nz})`);
  }
});

test("what is behind a window faces the street, on every side of the building", () => {
  for (const frontage of [0, 1, 2, 3]) {
    for (const zone of [1, 2]) {
      const { lot, pieces } = townhouse(frontage, zone);
      assert.equal(lot.frontage, frontage, `the fixture did not give the lot frontage ${frontage}`);
      const tris = trianglesOf(pieces, BEHIND_GLASS);
      assert.ok(tris.length > 0, `frontage ${frontage} zone ${zone}: nothing behind any window`);
      const out = EDGES[frontage].out;
      // Only the ones on the street face: the other three sides face their own
      // way, and a sill is horizontal.
      const facing = tris.filter((t) => Math.abs(t.normal[1]) < 0.5 && onStreetFace(lot, frontage, t.at));
      const wrong = facing.filter((t) => t.normal[0] * out[0] + t.normal[2] * out[1] < -0.5);
      const right = facing.filter((t) => t.normal[0] * out[0] + t.normal[2] * out[1] > 0.5);
      assert.ok(right.length > 0,
        `frontage ${frontage} zone ${zone}: nothing behind a window faces the street at all`);
      assert.equal(wrong.length, 0,
        `frontage ${frontage} zone ${zone}: ${wrong.length} of ${facing.length} pieces behind the `
        + "glass face INTO the building, where they are culled");
    }
  }
});

test("a shop has a ground floor: its storefront is glazed and backed", () => {
  // The picture this came from: a parade of shops at eye height with the
  // countryside visible under the signs, day and night (S16a's gate shots).
  for (const frontage of [0, 1, 2, 3]) {
    const { spec, pieces } = townhouse(frontage, 2);
    assert.ok(spec.storefronts.length > 0, `frontage ${frontage}: a shop with no storefront`);
    // `interior` since S16b: one quad across the whole frontage, where S7 had
    // a card per opening that a shopper at an angle saw past.
    const back = pieces.find((p) => p.name === "interior");
    assert.ok(back && back.part.triangles > 0, `frontage ${frontage}: the shop has no back wall`);
    const out = EDGES[frontage].out;
    for (let t = 0; t < back.part.triangles; t += 1) {
      const i = t * 9;
      const dot = back.part.normal[i] * out[0] + back.part.normal[i + 2] * out[1];
      assert.ok(dot > 0.5, `frontage ${frontage}: the shop's back wall faces away from the street`);
    }
  }
});

test("what is drawn ON a wall stands proud of it, not behind it", () => {
  // S9's flat panels — a course of brick, a shutter, a fanlight, a number
  // plate, a garage door — are quads 2 cm off the wall, which is what makes
  // them affordable. `atEdge`'s depth counts INWARD (every other caller in that
  // file passes a negative), and `panel` was written with a positive default,
  // so all of them sat two centimetres behind the wall that hides them, from
  // S9 in September to 2026-10-05. A terrace from the pavement was a flat
  // expanse of render with a chimney on it.
  //
  // The claim, in node: no piece of house furniture on the street face is
  // further INTO the building than the wall it is drawn on.
  for (const frontage of [0, 1, 2, 3]) {
    const { lot, pieces } = townhouse(frontage, 1);
    const out = EDGES[frontage].out;
    const wall = frontage === 0 ? lot.z0 : frontage === 1 ? lot.x1 : frontage === 2 ? lot.z1 : lot.x0;
    const axis = frontage % 2 === 0 ? 2 : 0;
    const furniture = trianglesOf(pieces, ["houseMasonry", "houseWoodwork", "houseDark", "housePanes"]);
    assert.ok(furniture.length > 0, `frontage ${frontage}: a house with no furniture at all`);
    const flat = furniture.filter((t) => Math.abs(t.normal[1]) < 0.5
      && Math.abs(t.at[axis] - wall) < 0.3);
    assert.ok(flat.length > 0, `frontage ${frontage}: nothing is drawn on the street wall`);
    for (const t of flat) {
      const proud = (t.at[axis] - wall) * (axis === 2 ? out[1] : out[0]);
      assert.ok(proud >= -0.001,
        `frontage ${frontage}: a panel ${(-proud * 100).toFixed(1)} cm INSIDE the wall it is drawn on`);
    }
  }
});
