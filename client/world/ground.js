// The one height function (ruling 038; specs/engine/04-city-model.md §4.2).
//
// Everything that stands on the ground asks this: the terrain mesh, every
// ribbon, prop, marking and overlay quad, the seat of every building, the
// walker's feet. Nothing decides for itself what the ground is doing — the
// failure that prevents is invisible in a screenshot and fatal on foot.
//
// Three layers, in this order:
//   1. the land — bilinear over tile-corner heights, a corner being the mean
//      of the four tiles that meet there, exactly as terrain.js draws it;
//   2. corridor grading — inside a road's half-width the ground is the road's
//      own GRADED profile, blended out smoothly so the field has no crease for
//      the ink pass to find. Until R3 it was the land at the nearest point on
//      the centre line, so a street went wherever the hill went and the
//      steepest on the saturated 96x96 was 37.1%; a junction's height is fixed
//      and the profile between two junctions obeys `road.maxGrade` (A42);
//   3. water — a water tile never rises above the water level.

import { getConfig } from "./config.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW } from "../constants-mirror.js";
import { closestOnPolyline } from "./corridors.js";
import { gradeProfile, heightOnProfile } from "./grade.js";

function sstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

export function createGround(state, network) {
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const reliefM = cfg.reliefM;
  const { width, height } = state;
  const elevation = state.tiles.elevation;
  const terrain = state.tiles.terrain;

  const tileHeight = (x, y) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return elevation[cy * width + cx] * reliefM;
  };
  const cornerHeight = (x, y) => (tileHeight(x - 1, y - 1) + tileHeight(x, y - 1)
    + tileHeight(x - 1, y) + tileHeight(x, y)) / 4;

  let waterLevel = -Infinity;
  // The field's vertical extent, so a ray march can skip straight to the band
  // the ground is actually in rather than stepping down from the camera
  // (slice V4). Corridor blending only ever interpolates between land heights,
  // so these bound the blended field too.
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < terrain.length; i += 1) {
    const h = elevation[i] * reliefM;
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
    if (terrain[i] === TERRAIN_WATER || terrain[i] === TERRAIN_SHALLOW) {
      waterLevel = Math.max(waterLevel, h);
    }
  }

  /** The bare land, metres. */
  function landAt(x, z) {
    const u = x / tileM;
    const v = z / tileM;
    const i = Math.max(0, Math.min(width, Math.floor(u)));
    const j = Math.max(0, Math.min(height, Math.floor(v)));
    const tx = Math.max(0, Math.min(1, u - i));
    const tz = Math.max(0, Math.min(1, v - j));
    const h00 = cornerHeight(i, j);
    const h10 = cornerHeight(i + 1, j);
    const h01 = cornerHeight(i, j + 1);
    const h11 = cornerHeight(i + 1, j + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // Heights at every tile CORNER, filled on first ask.
  //
  // The terrain mesh wants four per tile and its neighbours want the same ones:
  // a 128×128 chunk pass would make 65,536 `heightAt` calls where there are
  // only 16,641 distinct corners, and a corridor-blended `heightAt` is about a
  // microsecond. Once per model, and a single dirty chunk then costs nothing.
  let corners;
  function cornerHeightAt(cx, cz) {
    if (!corners) {
      corners = new Float32Array((width + 1) * (height + 1));
      for (let j = 0; j <= height; j += 1) {
        for (let i = 0; i <= width; i += 1) corners[j * (width + 1) + i] = heightAt(i * tileM, j * tileM);
      }
    }
    const i = cx < 0 ? 0 : cx > width ? width : cx;
    const j = cz < 0 ? 0 : cz > height ? height : cz;
    return corners[j * (width + 1) + i];
  }

  function tileOf(x, z) {
    const tx = Math.floor(x / tileM);
    const ty = Math.floor(z / tileM);
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return -1;
    return ty * width + tx;
  }

  const blend = cfg.road.blend;

  /** Every corridor's graded profile, by corridor id (slice R3, A42).
   *
   * Once, at derivation, from `landAt` — which does not depend on the network,
   * so there is no circle here even though `heightAt` does. A node's height is
   * `landAt` at the node and is shared by every corridor that meets there:
   * two streets that disagree about the height of the junction between them is
   * a step in the road that nothing can drive over.
   */
  const profiles = new Map();
  let steepestStreet = 0;
  if (network) {
    const maxGrade = cfg.road.maxGrade;
    const nodeHeight = new Map();
    for (const n of network.nodes) nodeHeight.set(n.id, landAt(n.x, n.z));
    for (const c of network.corridors) {
      const profile = gradeProfile(c.points, landAt, {
        maxGrade,
        // The junction box is level, and it is the same box the kerbside stops
        // short of (E3). Node heights alone were not enough: a street still
        // climbing where it entered a junction was dragged up by the blend to
        // meet the street crossing it, and 35.5% of the field's worst 37.1%
        // came from that drag rather than from any street.
        // `maxGrade` at or below zero turns the whole thing off, junction boxes
        // included, which is what lets a gate shoot the before and the after
        // from one harness (R3).
        flatEnds: maxGrade > 0 ? cfg.road.width / 2 + cfg.road.sidewalk : 0,
        ends: [nodeHeight.get(c.from) ?? landAt(c.points[0].x, c.points[0].z),
          nodeHeight.get(c.to) ?? landAt(c.points[c.points.length - 1].x, c.points[c.points.length - 1].z)],
      });
      profiles.set(c.id, profile);
      if (profile.steepest > steepestStreet) steepestStreet = profile.steepest;
    }
  }

  /** The ground, corridors and water applied. */
  function heightAt(x, z) {
    const land = landAt(x, z);
    let wsum = 0;
    let hsum = 0;
    if (network) {
      // Only the corridors whose box could reach here (`corridors.js` indexes
      // them by tile). Walking all of them made this O(corridors) per call, and
      // the lane graph asks seven thousand times on a saturated 96x96.
      for (const c of network.near ? network.near(x, z) : network.corridors) {
        const b = c.box;
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        const hit = closestOnPolyline(c.points, x, z);
        if (hit.dist > c.half + blend) continue;
        const w0 = 1 - sstep(c.half, c.half + blend, hit.dist);
        // weight squared sharpens the junction blend: two corridors crossing
        // average cleanly, one merely passing nearby does not drag the other
        const w = w0 * w0;
        wsum += w;
        const profile = profiles.get(c.id);
        hsum += w * (profile ? heightOnProfile(profile, hit.s) : landAt(hit.x, hit.z));
      }
      for (const n of network.nodes) {
        if (n.corridors.length > 0 && n.kind !== "isolated") continue;
        const d = Math.max(Math.abs(x - n.x), Math.abs(z - n.z));
        if (d > network.half + blend) continue;
        const w0 = 1 - sstep(network.half, network.half + blend, d);
        wsum += w0 * w0;
        hsum += w0 * w0 * landAt(n.x, n.z);
      }
    }
    // A smooth hand-off rather than a clamp at wsum = 1: a kink in the height
    // field is a crease, and a crease is a line the ink pass draws.
    const wBase = Math.exp(-6 * wsum);
    let h = (hsum + land * wBase) / (wsum + wBase);
    const tile = tileOf(x, z);
    if (tile >= 0 && (terrain[tile] === TERRAIN_WATER || terrain[tile] === TERRAIN_SHALLOW)) {
      h = Math.min(h, waterLevel);
    }
    return h;
  }

  function normalAt(x, z, e = 0.5) {
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    const nx = -hx / (2 * e);
    const nz = -hz / (2 * e);
    const len = Math.hypot(nx, 1, nz);
    return { x: nx / len, y: 1 / len, z: nz / len };
  }

  return {
    landAt, heightAt, cornerHeightAt, normalAt, waterLevel, minHeight, maxHeight, tileOf,
    /** A corridor's graded profile, for anything that wants the street's own
     * height without asking the blended field for it (R3). */
    profileOf: (id) => profiles.get(id),
    /** The worst rise over run left in any street, after grading. */
    steepestStreet,
  };
}
