// Chunked terrain. One merged mesh per 16×16 chunk, rebuilt only when that
// chunk's tiles change.
//
// The whole map as one mesh would mean rebuilding 16k tiles because one road
// appeared; a mesh per tile would mean thousands of draw calls. Chunks are the
// middle, and the dirty set is what keeps a build to the tiles that moved.

import * as THREE from "three";
import { TERRAIN_COLOURS } from "./palette.js";
import { PALETTES, makeMaterial } from "./style-assets.js";

export const CHUNK = 16;

/** Elevation is drawn flattened: full relief at city scale reads as noise and
 * makes roads look broken. A gentle lift is enough to show a valley. */
const HEIGHT_SCALE = 0.02;

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

function heightAt(state, x, y) {
  const cx = Math.max(0, Math.min(state.width - 1, x));
  const cy = Math.max(0, Math.min(state.height - 1, y));
  return state.tiles.elevation[cy * state.width + cx] * HEIGHT_SCALE;
}

/** Height at a tile CORNER: the average of the four tiles meeting there.
 *
 * Giving each tile one flat height leaves a vertical gap wherever two
 * neighbours differ, and the map renders with sky showing through in thin
 * horizontal seams. Sharing corners makes the surface continuous while the
 * per-tile colour keeps it reading as a grid. */
function cornerHeight(state, x, y) {
  return (heightAt(state, x - 1, y - 1) + heightAt(state, x, y - 1)
    + heightAt(state, x - 1, y) + heightAt(state, x, y)) / 4;
}

/** Rebuilds one chunk: two triangles per tile, flat-shaded, coloured by terrain
 * type. Flat rather than smoothed because a city grid wants to read as tiles. */
function buildChunk(state, chunk, styleName) {
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
      const h00 = cornerHeight(state, x, y);
      const h10 = cornerHeight(state, x + 1, y);
      const h01 = cornerHeight(state, x, y + 1);
      const h11 = cornerHeight(state, x + 1, y + 1);
      const table = (PALETTES[styleName] ?? PALETTES.plain).terrain;
      colour.setHex(table[state.tiles.terrain[index]] ?? TERRAIN_COLOURS[state.tiles.terrain[index]] ?? 0xff00ff);

      // Two triangles, corners at integer coordinates so tiles meet exactly.
      //
      // Counter-clockwise seen from +Y, so the normal points UP. Winding the
      // other way — which is the natural reading order — puts the normal at
      // -Y, and the whole ground plane is backface-culled: a city of roads and
      // buildings floating on an empty sky.
      const quad = [
        [x, h00, y], [x + 1, h11, y + 1], [x + 1, h10, y],
        [x, h00, y], [x, h01, y + 1], [x + 1, h11, y + 1],
      ];
      for (const [vx, vy, vz] of quad) {
        positions[p] = vx; positions[p + 1] = vy; positions[p + 2] = vz;
        p += 3;
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
export function updateTerrain(state, terrain) {
  let rebuilt = 0;
  for (const chunk of terrain.chunks) {
    if (!chunk.dirty) continue;
    buildChunk(state, chunk, terrain.styleName);
    rebuilt += 1;
  }
  return rebuilt;
}
