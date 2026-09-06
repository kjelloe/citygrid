// The L3 facade builder (slice E5; spec §6.2).
//
// `facade.js` is pure and takes no palette, so what it builds can be asserted
// here rather than looked at — which matters because the two things that go
// wrong in a facade are both invisible from the pavement: an opening that is a
// decal rather than a hole, and geometry that reaches past the lot line onto
// the street the walker has to get down.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { createModel } from "../client/world/model.js";
import { buildingParams } from "../client/world/params.js";
import { facadeSpec } from "../client/world/facade-spec.js";
import { buildFacade } from "../client/render/facade.js";
import { PALETTES } from "../client/render/palettes.js";

const ZONES = { residential: 1, commercial: 2, industrial: 3, civic: 0 };

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

function built({ zone = 1, level = 3, w = 1, h = 1, id = 1 } = {}) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  pave(state, row(5, 1, 14));
  const building = {
    id, def: "", zone, x: 4, y: 6, w, h, owner: 1,
    level, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  for (let yy = building.y; yy < building.y + h; yy += 1) {
    for (let xx = building.x; xx < building.x + w; xx += 1) state.tiles.buildingId[tileAt(state.width, xx, yy)] = id;
  }
  const model = createModel(state);
  const lot = model.lotOf(id);
  const spec = facadeSpec(lot, buildingParams(building, PALETTES.plain, 0x998877));
  return { lot, spec, pieces: buildFacade(spec) };
}

function boundsOf(pieces) {
  const out = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const { part } of pieces) {
    for (let i = 0; i < part.triangles * 3; i += 1) {
      out.x0 = Math.min(out.x0, part.position[i * 3]); out.x1 = Math.max(out.x1, part.position[i * 3]);
      out.y0 = Math.min(out.y0, part.position[i * 3 + 1]); out.y1 = Math.max(out.y1, part.position[i * 3 + 1]);
      out.z0 = Math.min(out.z0, part.position[i * 3 + 2]); out.z1 = Math.max(out.z1, part.position[i * 3 + 2]);
    }
  }
  return out;
}

const triangles = (pieces) => pieces.reduce((n, p) => n + p.part.triangles, 0);

test("every category builds something, with no empty pieces", () => {
  for (const [name, zone] of Object.entries(ZONES)) {
    const { pieces } = built({ zone });
    assert.ok(triangles(pieces) > 40, `${name} came out at ${triangles(pieces)} triangles`);
    for (const piece of pieces) assert.ok(piece.part.triangles > 0, `${name} has an empty piece`);
  }
});

test("a building stands on its seat and reaches its own height", () => {
  const { spec, pieces } = built({ zone: ZONES.residential, level: 3 });
  const b = boundsOf(pieces);
  assert.ok(Math.abs(b.y0 - spec.seat) < 1e-6, `the walls start at ${b.y0}, the lot is at ${spec.seat}`);
  const wallTop = spec.seat + spec.groundH + (spec.storeys - 1) * spec.floorH;
  assert.ok(b.y1 > wallTop, "the roof must be above the walls");
  assert.ok(b.y1 < wallTop + 8, `a ${(b.y1 - wallTop).toFixed(1)} m roof on a house`);
});

test("nothing but the eave reaches past the lot, and the eave is small", () => {
  for (const zone of Object.values(ZONES)) {
    const { spec, pieces } = built({ zone, w: 2, h: 2 });
    const b = boundsOf(pieces);
    // A portico and a porch stand in front of the wall, so the allowance is the
    // deepest of them — but it is an allowance, not "anything goes".
    const reach = 1.8;
    assert.ok(b.x0 >= spec.x0 - reach, `${zone} reaches ${spec.x0 - b.x0} m west of its lot`);
    assert.ok(b.x1 <= spec.x1 + reach, `${zone} reaches ${b.x1 - spec.x1} m east of its lot`);
    assert.ok(b.z0 >= spec.z0 - reach, `${zone} reaches ${spec.z0 - b.z0} m north of its lot`);
    assert.ok(b.z1 <= spec.z1 + reach, `${zone} reaches ${b.z1 - spec.z1} m south of its lot`);
  }
});

test("an opening is a HOLE: the wall has a gap and the reveal fills it", () => {
  const { spec, pieces } = built({ zone: ZONES.residential, level: 3 });
  const walls = pieces[0].part;
  // Every window's centre must be missing from the wall. Sample the wall's
  // triangles for one covering the middle of a first-floor window.
  const front = spec.edges.find((e) => e.street);
  const bay = front.length / front.bays;
  const groundTop = spec.seat + spec.groundH;
  const wy = groundTop + front.window.sill + front.window.h / 2;
  const wu = bay * 0.5;
  const covered = (u, y) => {
    // The north face runs +x from (x0, z0); u is along it.
    const px = spec.x0 + u;
    for (let t = 0; t < walls.triangles; t += 1) {
      const i = t * 9;
      const zs = [walls.position[i + 2], walls.position[i + 5], walls.position[i + 8]];
      if (zs.some((z) => Math.abs(z - spec.z0) > 1e-6)) continue;
      const xs = [walls.position[i], walls.position[i + 3], walls.position[i + 6]];
      const ys = [walls.position[i + 1], walls.position[i + 4], walls.position[i + 7]];
      if (px >= Math.min(...xs) && px <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys)) return true;
    }
    return false;
  };
  assert.equal(front.side, 0, "the fixture's frontage should face north");
  assert.equal(covered(wu, wy), false, "the wall covers the middle of a window");
  // ...and the wall is still there beside it.
  assert.equal(covered(0.15, wy), true, "the wall vanished between the windows too");
});

test("a taller building has more windows, not bigger ones", () => {
  const low = built({ zone: ZONES.residential, level: 1 });
  const high = built({ zone: ZONES.residential, level: 6 });
  assert.ok(triangles(high.pieces) > triangles(low.pieces));
  // The reveals are piece 1; each opening contributes a fixed number of
  // triangles, so the count is proportional to the number of openings.
  const reveals = (b) => b.pieces[1].part.triangles;
  assert.ok(reveals(high) > reveals(low) * 1.5,
    `${reveals(low)} against ${reveals(high)} reveal triangles`);
});

test("lit windows go in their own bucket, dark until the night rig turns them up", () => {
  const { pieces } = built({ zone: ZONES.residential, level: 5 });
  const emissive = pieces.filter((p) => p.options?.emissive !== undefined);
  assert.equal(emissive.length, 1);
  assert.ok(emissive[0].part.triangles > 0, "no window is lit anywhere in the city");
  const glazing = pieces.filter((p) => p.options === undefined && p.colour === emissive[0].colour);
  assert.ok(glazing.length > 0, "every window is lit, which is a different bug");
});

test("the same building builds the same geometry twice", () => {
  const a = built({ zone: ZONES.commercial, w: 2 });
  const b = built({ zone: ZONES.commercial, w: 2 });
  assert.equal(a.pieces.length, b.pieces.length);
  for (let i = 0; i < a.pieces.length; i += 1) {
    assert.equal(a.pieces[i].part.triangles, b.pieces[i].part.triangles);
    assert.deepEqual([...a.pieces[i].part.position], [...b.pieces[i].part.position]);
  }
});

test("every triangle is wound the way its normal points", () => {
  for (const zone of Object.values(ZONES)) {
    const { pieces } = built({ zone, w: 2 });
    for (const { part } of pieces) {
      for (let t = 0; t < part.triangles; t += 1) {
        const i = t * 9;
        const ux = part.position[i + 3] - part.position[i];
        const uy = part.position[i + 4] - part.position[i + 1];
        const uz = part.position[i + 5] - part.position[i + 2];
        const vx = part.position[i + 6] - part.position[i];
        const vy = part.position[i + 7] - part.position[i + 1];
        const vz = part.position[i + 8] - part.position[i + 2];
        const cx = uy * vz - uz * vy;
        const cy = uz * vx - ux * vz;
        const cz = ux * vy - uy * vx;
        const dot = cx * part.normal[i] + cy * part.normal[i + 1] + cz * part.normal[i + 2];
        assert.ok(dot > 0, `zone ${zone} triangle ${t} is wound against its normal`);
      }
    }
  }
});
