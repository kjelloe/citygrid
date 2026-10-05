// The railway at L3 (slice T3; workitems-transport.md §T3).
//
// A track is a bed with two rails on it. What tells it from a narrow road at
// street level is that it stands UP: `rail.lift` of ballast, sleepers across,
// and two steel lines a gauge apart — and what tells it from a road at city
// zoom is that it is brown rather than grey (T2's L2 line).
//
// Plumbing only, like `streets-l3.js` beside it: the polylines are
// `client/world/corridors.js` derived over the rail layer, and the numbers are
// `data/cityviewer.json`.
//
// The ground does NOT flatten under a line (that is a road corridor's
// privilege, spec §5.1), so a track over a hill follows the hill. That is
// wrong for a railway and right for this slice: the grading machinery is keyed
// to the road network, and moving it is T4's or its own.

import * as THREE from "three";
import { ribbon, skirt, dashes, clip } from "./ribbon.js";
import { getConfig } from "../world/config.js";
import { NET_PRESENT, NET_AVENUE } from "../constants-mirror.js";
import { heightOnProfile } from "../world/grade.js";
import { closestOnPolyline } from "../world/corridors.js";
import { shadeHex } from "./palette.js";

const IDENTITY = new THREE.Matrix4();

function toGeometry(strip) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(strip.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(strip.normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(strip.uv, 2));
  return geometry;
}

function addStrip(baker, strip, colour, options) {
  if (!strip || strip.triangles === 0) return;
  const geometry = toGeometry(strip);
  baker.add(geometry, IDENTITY, colour, options);
  geometry.dispose();
}

/** A polyline offset `distance` metres to its left (negative for its right).
 * The same mitre `streets-l3.js` uses; a pinched offset on a bend is exactly
 * what you notice standing beside the track. */
function shift(points, distance) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      x: p.x + (-(b.z - a.z) / len) * distance,
      z: p.z + ((b.x - a.x) / len) * distance,
    };
  });
}

function chunkBox(cx, cy, chunkTiles, tileM) {
  return {
    x0: cx * chunkTiles * tileM, x1: (cx + 1) * chunkTiles * tileM,
    z0: cy * chunkTiles * tileM, z1: (cy + 1) * chunkTiles * tileM,
  };
}

/** Each rail corridor's part in this chunk. By TILE like the street pass, so a
 * line crossing a chunk boundary is built into both rather than stopping at
 * the seam. */
export function railCorridors(model, cx, cy) {
  const cfg = getConfig();
  const box = chunkBox(cx, cy, cfg.chunkTiles, cfg.tileM);
  const out = [];
  for (const corridor of model.rail?.corridors ?? []) {
    const runs = clip(corridor.points, box);
    if (runs.length === 0) continue;
    out.push({ corridor, runs });
  }
  return out;
}

/**
 * The ballast, the sleepers and the two rails of `corridors[from…]`, until
 * `stop()` says the frame is spent; returns where it stopped.
 *
 * Sliced like the street phase for the same reason: a long line is as much
 * geometry as a long street, and A78's check reads the worst phase of a bake.
 */
export function bakeRailCorridors(baker, state, model, corridors, from, stop, palette) {
  const cfg = getConfig();
  const { width, gauge, railHalf, sleeperEvery, sleeperHalf, lift } = cfg.rail;
  const half = width / 2;
  const height = model.heightAt;

  const ballast = shadeHex(palette.rail, 1.25);
  const sleeper = palette.rail;
  const steel = 0xb8bcc0;

  let i = from;
  while (i < corridors.length) {
    const { corridor, runs } = corridors[i];
    i += 1;
    // The LINE's own graded profile (Q120, A118), not the height field: a
    // railway cuts and embanks, and the field is what every lot, lane, prop and
    // walker reads. `model.railHeightAt` answers the ballast's top; the ground
    // is still the ground, and the difference between them is the earthwork
    // this draws under the track.
    const profile = model.railProfileOf?.(corridor.id);
    const railAt = (x, z) => {
      if (!profile) return height(x, z);
      return heightOnProfile(profile, closestOnPolyline(corridor.points, x, z).s);
    };
    for (const pts of runs) {
      const hs = pts.map((p) => railAt(p.x, p.z));
      // The bed, and the face it stands on. A track drawn flat on the ground
      // is a brown road; the `skirt` is what makes it a railway from the
      // pavement — and where the line stands above the land it IS the
      // embankment, so the face reaches down to the ground rather than being a
      // ten-centimetre lip. In a cutting the same face goes the other way and
      // reads as the retaining wall it is.
      const drops = pts.map((p, k) => {
        const ground = height(p.x, p.z);
        const fill = hs[k] + lift - ground;
        return Math.abs(fill) < lift ? lift : fill;
      });
      addStrip(baker, ribbon(pts, half, railAt, { lift, heights: hs }), ballast);
      addStrip(baker, skirt(pts, half, railAt, lift, { lift, heights: hs, drops }), shadeHex(ballast, 0.82));
      // Sleepers across, then the rails on top of them — in that order, so a
      // rail is never buried by the sleeper it rests on.
      for (const dash of dashes(pts, sleeperHalf * 2, sleeperEvery - sleeperHalf * 2)) {
        for (const tie of crossPieces(dash, gauge)) {
          addStrip(baker, ribbon(tie, sleeperHalf, railAt, { lift: lift + 0.01 }), sleeper);
        }
      }
      for (const side of [-1, 1]) {
        addStrip(baker, ribbon(shift(pts, side * gauge / 2), railHalf, railAt,
          { lift: lift + 0.05 }), steel);
      }
    }
    if (stop()) break;
  }
  return i;
}

/** A sleeper: the short piece ACROSS the track at a dash's middle, a little
 * wider than the gauge. Returned as a list so the caller can ribbon it. */
function crossPieces(dash, gauge) {
  if (dash.length < 2) return [];
  const a = dash[0];
  const b = dash[dash.length - 1];
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = -(b.z - a.z) / len;
  const nz = (b.x - a.x) / len;
  const reach = gauge * 0.8;
  return [[{ x: mx - nx * reach, z: mz - nz * reach }, { x: mx + nx * reach, z: mz + nz * reach }]];
}

/**
 * Level crossings (A66): where one tile carries both networks.
 *
 * A bar of paint across the ROAD on each side of the track, and a post at each
 * kerb. Not barriers that move — a boom that never comes down is worse than no
 * boom, and a boom that does is a state machine the renderer has no business
 * running (ruling 037). The bar is what a driver actually reads.
 */
export function bakeCrossings(baker, state, model, cx, cy, palette) {
  const cfg = getConfig();
  const chunkTiles = cfg.chunkTiles;
  const tileM = cfg.tileM;
  const height = model.heightAt;
  const mark = palette.roadMark ?? 0xd8d4c8;
  const post = shadeHex(palette.rail, 1.4);

  for (let ty = cy * chunkTiles; ty < (cy + 1) * chunkTiles; ty += 1) {
    for (let tx = cx * chunkTiles; tx < (cx + 1) * chunkTiles; tx += 1) {
      if (tx >= state.width || ty >= state.height) continue;
      const index = ty * state.width + tx;
      if ((state.tiles.rail[index] & NET_PRESENT) === 0) continue;
      if ((state.tiles.road[index] & NET_PRESENT) === 0) continue;

      // Which way the ROAD runs through the tile decides where the bars go:
      // across the carriageway, one either side of the track.
      const roadMask = state.tiles.road[index] & 15;
      const eastWest = (roadMask & 2) !== 0 || (roadMask & 8) !== 0;
      const cxm = (tx + 0.5) * tileM;
      const czm = (ty + 0.5) * tileM;
      // The road's OWN half-width (A116): an avenue crossing a line is fourteen
      // metres of carriageway, and a barrier drawn at a street's eight ends in
      // the middle of it.
      const avenue = (state.tiles.road[index] & NET_AVENUE) !== 0;
      const half = (avenue ? cfg.road.avenue.width : cfg.road.width) / 2;
      const off = cfg.rail.width / 2 + 0.6;
      for (const side of [-1, 1]) {
        const bar = eastWest
          ? [{ x: cxm + side * off, z: czm - half }, { x: cxm + side * off, z: czm + half }]
          : [{ x: cxm - half, z: czm + side * off }, { x: cxm + half, z: czm + side * off }];
        addStrip(baker, ribbon(bar, 0.2, height, { lift: cfg.road.lift + 0.02 }), mark);
        // A post at each end of the bar, on the kerb rather than in the road.
        for (const end of [0, 1]) {
          const p = bar[end];
          const px = p.x + (eastWest ? 0 : (end === 0 ? -0.8 : 0.8));
          const pz = p.z + (eastWest ? (end === 0 ? -0.8 : 0.8) : 0);
          const stem = [{ x: px, z: pz - 0.09 }, { x: px, z: pz + 0.09 }];
          addStrip(baker, skirt(stem, 0.09, height, -2.2, { lift: cfg.road.lift }), post);
        }
      }
    }
  }
}
