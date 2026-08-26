// Instanced meshes for everything repeated: road segments, wires, pipes,
// buildings and props.
//
// One InstancedMesh per (shape, material) pair, refilled when the world
// changes. A city of ten thousand buildings is a few dozen draw calls, which is
// the only reason a 128×128 region renders on a phone at all.

import * as THREE from "three";
import { UI, buildingColour, PLAYER_COLOURS } from "./palette.js";

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/** Placeholder geometry (ruling 013): flat, untextured, obviously unfinished,
 * correct in footprint and height so the simulation and the camera can be
 * judged before any real asset exists. */
function placeholderBox(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(0, h / 2, 0);
  return geometry;
}

export function createInstances(scene) {
  const pools = {};
  const make = (name, geometry, colour, capacity) => {
    const material = new THREE.MeshLambertMaterial({ color: colour });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    pools[name] = mesh;
    return mesh;
  };

  make("road", placeholderBox(1, 0.06, 1), UI.road, 20000);
  make("wire", placeholderBox(0.1, 0.45, 0.1), UI.wire, 20000);
  make("pipe", placeholderBox(0.9, 0.05, 0.9), UI.pipe, 20000);
  make("ruin", placeholderBox(0.8, 0.18, 0.8), UI.ruin, 4000);

  // Buildings are one pool per footprint; height comes from the instance
  // scale, colour from zone and value tier.
  make("b1", placeholderBox(0.8, 1, 0.8), 0xffffff, 12000);
  make("b2", placeholderBox(1.8, 1, 0.8), 0xffffff, 4000);
  make("b3", placeholderBox(0.8, 1, 1.8), 0xffffff, 4000);
  make("b4", placeholderBox(1.8, 1, 1.8), 0xffffff, 4000);
  make("civic", placeholderBox(1, 1, 1), 0xffffff, 2000);

  for (const name of ["b1", "b2", "b3", "b4", "civic"]) {
    pools[name].instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(pools[name].count > 0 ? pools[name].count * 3 : pools[name].instanceMatrix.count * 3), 3,
    );
  }
  return pools;
}

function reset(pools) {
  for (const mesh of Object.values(pools)) mesh.count = 0;
}

function push(mesh, x, y, z, sx, sy, sz, colour) {
  const i = mesh.count;
  if (i >= mesh.instanceMatrix.count) return;
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  if (colour !== undefined && mesh.instanceColor) {
    tint.setHex(colour);
    mesh.instanceColor.setXYZ(i, tint.r, tint.g, tint.b);
  }
  mesh.count = i + 1;
}

const HEIGHT_SCALE = 0.02;

/** Refills every pool from state. Called when the world changes, not per
 * frame: a static city costs nothing to keep on screen. */
export function updateInstances(state, pools, options = {}) {
  reset(pools);
  const ground = (index) => state.tiles.elevation[index] * HEIGHT_SCALE;
  const showOwner = options.territory === true;
  const underground = options.underground === true;

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = y * state.width + x;
      const h = ground(index);
      if (state.tiles.road[index] & 16) push(pools.road, x + 0.5, h, y + 0.5, 1, 1, 1);
      if (state.tiles.wire[index] & 16) push(pools.wire, x + 0.5, h, y + 0.5, 1, 1, 1);
      // Pipes are underground (gamedesign 7.5). They are drawn only when the
      // underground view is on, which the pipe tool turns on for you.
      if (underground && (state.tiles.pipe[index] & 16)) {
        push(pools.pipe, x + 0.5, h + 0.01, y + 0.5, 1, 1, 1);
      }
      if (state.tiles.flags[index] & 8) push(pools.ruin, x + 0.5, h, y + 0.5, 1, 1, 1);
    }
  }

  for (const building of state.buildings) {
    const index = building.y * state.width + building.x;
    const h = ground(index);
    const cx = building.x + building.w / 2;
    const cz = building.y + building.h / 2;

    if (building.zone === 0) {
      // Civic and utility buildings: footprint from the entity, a squat height
      // so they read as infrastructure rather than as towers.
      const colour = showOwner
        ? PLAYER_COLOURS[building.owner] ?? UI.placeholderTint
        : UI.placeholderTint;
      push(pools.civic, cx, h, cz, building.w * 0.9, 0.6 + building.w * 0.2, building.h * 0.9, colour);
      continue;
    }

    const pool = building.w === 2 && building.h === 2 ? pools.b4
      : building.w === 2 ? pools.b2
        : building.h === 2 ? pools.b3
          : pools.b1;
    // Height reads development level; colour reads zone and value tier — or
    // owner, when the territory overlay is on.
    const height = 0.5 + building.level * 0.55;
    const colour = showOwner
      ? PLAYER_COLOURS[building.owner] ?? UI.placeholderTint
      : buildingColour(building.zone, building.valueTier);
    push(pool, cx, h, cz, 1, height, 1, colour);
  }

  for (const mesh of Object.values(pools)) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return Object.values(pools).reduce((sum, mesh) => sum + mesh.count, 0);
}
