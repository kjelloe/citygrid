// Tile picking by ray-plane intersection and integer grid maths, never by
// raycasting the scene.
//
// Raycasting would make picking depend on what happens to be drawn — a tile
// under a tree would pick the tree, an empty tile would pick nothing, and the
// answer would change with the level of detail. The ground is a plane at y=0
// and the grid is arithmetic; that is all picking needs.

import * as THREE from "three";
import { marchGround } from "../world/raymarch.js";

const ndc = new THREE.Vector2();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();

/**
 * Screen pixel to tile. Returns {x, y} in tile coordinates, or undefined if the
 * ray misses the ground plane entirely.
 */
/** The ray through a pixel, in TILE units.
 *
 * The two projections build it differently and this is the only place that
 * knows how. An orthographic camera has one direction for every pixel — its
 * own — and the origin moves; a perspective camera has one origin, the eye, and
 * the direction is toward the unprojected point. Getting this wrong is not
 * subtle at the edges of the frame and is invisible at the centre, which is
 * where a gate would look (slice V5).
 */
export function groundRay(view, pixelX, pixelY, canvasWidth, canvasHeight) {
  ndc.set((pixelX / canvasWidth) * 2 - 1, -((pixelY / canvasHeight) * 2 - 1));
  const camera = view.camera;
  origin.set(ndc.x, ndc.y, -1).unproject(camera);
  if (view.mode === "city") {
    direction.copy(origin).sub(camera.position).normalize();
    return { from: camera.position, direction };
  }
  direction.set(0, 0, -1).transformDirection(camera.matrixWorld).normalize();
  return { from: origin, direction };
}

/** Where that ray meets the ground, in TILE units and unrounded. `pickTile`
 * floors it; a pan needs the fraction. */
export function groundPoint(view, pixelX, pixelY, canvasWidth, canvasHeight, model, mapWidth, mapHeight) {
  const { from, direction } = groundRay(view, pixelX, pixelY, canvasWidth, canvasHeight);
  const tileM = model.tileM;
  const hit = marchGround(
    {
      ox: from.x * tileM, oy: from.y * tileM, oz: from.z * tileM,
      dx: direction.x, dy: direction.y, dz: direction.z,
    },
    model.heightAt,
    {
      far: (mapWidth + mapHeight + 4000) * tileM,
      // The field's own extent: an orthographic camera is 1,200 tiles out along
      // its orbit and everything interesting is in a band a hundred metres deep.
      yMax: model.maxHeight + 1,
      yMin: model.minHeight - 1,
    },
  );
  return hit ? { x: hit.x / tileM, z: hit.z / tileM } : undefined;
}

export function pickTile(view, pixelX, pixelY, canvasWidth, canvasHeight, mapWidth, mapHeight, model) {
  // Against the HEIGHT FIELD, not a plane at y = 0 (slice V4, ruling 038).
  //
  // The plane was exact while the map was flat. With relief the ray carries on
  // past the hillside it struck and lands further away, so clicking the near
  // face of a hill builds on the far side of it — an error that grows with the
  // slope and with the tilt, smallest where it is tested and largest where the
  // game is played. The answer is still an integer tile.
  const hit = groundPoint(view, pixelX, pixelY, canvasWidth, canvasHeight, model, mapWidth, mapHeight);
  if (!hit) return undefined;
  const x = Math.floor(hit.x);
  const y = Math.floor(hit.z);
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return undefined;
  return { x, y };
}

/** World position of a tile's centre — the inverse of the above, used to place
 * meshes and to aim the camera at something. */
export function tileCentre(x, y) {
  return { x: x + 0.5, z: y + 0.5 };
}
