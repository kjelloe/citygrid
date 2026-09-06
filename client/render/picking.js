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
export function pickTile(view, pixelX, pixelY, canvasWidth, canvasHeight, mapWidth, mapHeight, model) {
  ndc.set((pixelX / canvasWidth) * 2 - 1, -((pixelY / canvasHeight) * 2 - 1));

  const camera = view.camera;
  // An orthographic ray: unproject the near point and take the camera's own
  // direction, rather than the perspective trick of pointing at the far plane.
  origin.set(ndc.x, ndc.y, -1).unproject(camera);
  direction.set(0, 0, -1).transformDirection(camera.matrixWorld).normalize();

  // Against the HEIGHT FIELD, not a plane at y = 0 (slice V4, ruling 038).
  //
  // The plane was exact while the map was flat. With relief the ray carries on
  // past the hillside it struck and lands further away, so clicking the near
  // face of a hill builds on the far side of it — an error that grows with the
  // slope and with the tilt, smallest where it is tested and largest where the
  // game is played. Everything below stays the same: the ground spans
  // [0, mapWidth] × [0, mapHeight] and the answer is still an integer tile.
  const tileM = model.tileM;
  const hit = marchGround(
    {
      ox: origin.x * tileM, oy: origin.y * tileM, oz: origin.z * tileM,
      dx: direction.x, dy: direction.y, dz: direction.z,
    },
    model.heightAt,
    {
      far: (mapWidth + mapHeight + 4000) * tileM,
      // The field's own extent: the camera is 1,200 tiles out along its orbit
      // and everything interesting is in a band a hundred metres deep.
      yMax: model.maxHeight + 1,
      yMin: model.minHeight - 1,
    },
  );
  if (!hit) return undefined;

  const x = Math.floor(hit.x / tileM);
  const y = Math.floor(hit.z / tileM);
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return undefined;
  return { x, y };
}

/** World position of a tile's centre — the inverse of the above, used to place
 * meshes and to aim the camera at something. */
export function tileCentre(x, y) {
  return { x: x + 0.5, z: y + 0.5 };
}
