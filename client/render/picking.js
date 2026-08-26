// Tile picking by ray-plane intersection and integer grid maths, never by
// raycasting the scene.
//
// Raycasting would make picking depend on what happens to be drawn — a tile
// under a tree would pick the tree, an empty tile would pick nothing, and the
// answer would change with the level of detail. The ground is a plane at y=0
// and the grid is arithmetic; that is all picking needs.

import * as THREE from "three";

const ray = new THREE.Ray();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

/**
 * Screen pixel to tile. Returns {x, y} in tile coordinates, or undefined if the
 * ray misses the ground plane entirely.
 */
export function pickTile(view, pixelX, pixelY, canvasWidth, canvasHeight, mapWidth, mapHeight) {
  ndc.set((pixelX / canvasWidth) * 2 - 1, -((pixelY / canvasHeight) * 2 - 1));

  const camera = view.camera;
  // An orthographic ray: unproject the near point and take the camera's own
  // direction, rather than the perspective trick of pointing at the far plane.
  const origin = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const direction = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld).normalize();
  ray.set(origin, direction);

  if (!ray.intersectPlane(plane, hit)) return undefined;

  // The ground spans [0, mapWidth] × [0, mapHeight] with tile centres at
  // integer + 0.5, so the floor of the raw coordinate is the tile.
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
