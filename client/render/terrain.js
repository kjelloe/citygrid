// Chunked terrain. One merged mesh per 16×16 chunk, rebuilt only when that
// chunk's tiles change.
//
// The whole map as one mesh would mean rebuilding 16k tiles because one road
// appeared; a mesh per tile would mean thousands of draw calls. Chunks are the
// middle, and the dirty set is what keeps a build to the tiles that moved.

import * as THREE from "three";
import { PALETTES, makeMaterial } from "./style-assets.js";
import { NET_PRESENT } from "../constants-mirror.js";
import { createGroundColour } from "../world/ground-colour.js";
import { getConfig } from "../world/config.js";

export const CHUNK = 16;

// The heights come from `model.heightAt` now (slice V4, ruling 038), not from
// `elevation × 0.02`. The old constant flattened the map to about a sixth of a
// tile of relief across its whole width, because "full relief at city scale
// reads as noise and makes roads look broken" — which was true of a road drawn
// as a flat quad at its own tile's height. A road is a corridor now: inside its
// half-width the ground IS the corridor's centreline height, so the road does
// not break and the hill can be a hill.

export function createTerrain(state, styleName = "plain") {
  const chunksX = Math.ceil(state.width / CHUNK);
  const chunksY = Math.ceil(state.height / CHUNK);
  const group = new THREE.Group();
  const chunks = [];

  for (let cy = 0; cy < chunksY; cy += 1) {
    for (let cx = 0; cx < chunksX; cx += 1) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(styleName, 0xffffff));
      mesh.frustumCulled = true;
      group.add(mesh);
      chunks.push({ cx, cy, mesh, dirty: true });
    }
  }
  return { group, chunks, chunksX, chunksY, styleName };
}

export function markDirty(terrain, x, y) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const chunk = terrain.chunks[cy * terrain.chunksX + cx];
  if (chunk) chunk.dirty = true;
}

export function markAllDirty(terrain) {
  for (const chunk of terrain.chunks) chunk.dirty = true;
}

/** Rebuilds one chunk: two triangles per tile, flat-shaded, coloured by terrain
 * type. Flat rather than smoothed because a city grid wants to read as tiles. */
function buildChunk(state, chunk, styleName, ground, height) {
  const x0 = chunk.cx * CHUNK;
  const y0 = chunk.cy * CHUNK;
  const x1 = Math.min(x0 + CHUNK, state.width);
  const y1 = Math.min(y0 + CHUNK, state.height);
  const tiles = (x1 - x0) * (y1 - y0);

  const positions = new Float32Array(tiles * 6 * 3);
  const colours = new Float32Array(tiles * 6 * 3);
  const colour = new THREE.Color();
  let p = 0;
  let c = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * state.width + x;
      const h00 = height(x, y);
      const h10 = height(x + 1, y);
      const h01 = height(x, y + 1);
      const h11 = height(x + 1, y + 1);
      // A road is a COLOUR OF THE GROUND, not a quad stacked on it (slice N30),
      // and natural ground blends across its corners while built land does not
      // (slice V3) — `client/world/ground-colour.js` decides both.
      //
      // The road was a quad, and a quad sits flat at its own tile's height
      // while this surface shares corners with its neighbours: every elevation
      // step showed a green seam between two road tiles, which is what the P33
      // playtest saw. N28 closed it with a skirt at twelve triangles a tile;
      // painted into the mesh it is seamless by construction and free.
      const c00 = ground.corner(x, y, 0);
      const c10 = ground.corner(x, y, 1);
      const c01 = ground.corner(x, y, 2);
      const c11 = ground.corner(x, y, 3);

      // Two triangles, corners at integer coordinates so tiles meet exactly.
      //
      // Counter-clockwise seen from +Y, so the normal points UP. Winding the
      // other way — which is the natural reading order — puts the normal at
      // -Y, and the whole ground plane is backface-culled: a city of roads and
      // buildings floating on an empty sky.
      const quad = [
        [x, h00, y, c00], [x + 1, h11, y + 1, c11], [x + 1, h10, y, c10],
        [x, h00, y, c00], [x, h01, y + 1, c01], [x + 1, h11, y + 1, c11],
      ];
      for (const [vx, vy, vz, hex] of quad) {
        positions[p] = vx; positions[p + 1] = vy; positions[p + 2] = vz;
        p += 3;
        colour.setHex(hex);
        colours[c] = colour.r; colours[c + 1] = colour.g; colours[c + 2] = colour.b;
        c += 3;
      }
    }
  }

  const geometry = chunk.mesh.geometry;
  geometry.dispose();
  const rebuilt = new THREE.BufferGeometry();
  rebuilt.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  rebuilt.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  rebuilt.computeVertexNormals();
  rebuilt.computeBoundingSphere();
  chunk.mesh.geometry = rebuilt;
  chunk.dirty = false;
}

/** Rebuilds every dirty chunk. Returns how many were rebuilt, which the debug
 * overlay reports — a frame that rebuilds every chunk is a bug, not a cost. */
export function updateTerrain(state, terrain, model) {
  let rebuilt = 0;
  // One colour source for the whole pass: it caches a per-tile colour and
  // floods the distance-to-street field once. Building it per chunk would redo
  // both sixty-four times on a 128×128.
  const palette = PALETTES[terrain.styleName] ?? PALETTES.plain;
  const ground = createGroundColour(state, palette);
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const dip = cfg.road.dip / tileM;

  /** A mesh corner's height, in TILE units — the mesh is built in tiles and
   * the pools are in tiles until V5 moves the camera to metres.
   *
   * A corner any of whose four tiles carries a road drops by `road.dip`, so the
   * whole carriageway plus a half-tile margin sits below the verge. That is
   * what a kerb is, and it is what stops E3's ribbons — drawn at `heightAt +
   * 0.02` — poking through the ground they lie on. */
  const height = (cx, cz) => {
    let paved = false;
    for (let j = -1; j <= 0 && !paved; j += 1) {
      for (let i = -1; i <= 0 && !paved; i += 1) {
        const x = cx + i;
        const y = cz + j;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if ((state.tiles.road[y * state.width + x] & NET_PRESENT) !== 0) paved = true;
      }
    }
    return model.cornerHeightAt(cx, cz) / tileM - (paved ? dip : 0);
  };
  for (const chunk of terrain.chunks) {
    if (!chunk.dirty) continue;
    buildChunk(state, chunk, terrain.styleName, ground, height);
    rebuilt += 1;
  }
  return rebuilt;
}
