// Orthographic low-isometric camera with four snapped yaw angles.
//
// Rotation is a hard requirement (ruling 006), and snapped rather than free
// because the design asks for "comfortable angles" rather than disorienting
// freedom. Four angles also means a future sprite pipeline stays expressible.

import * as THREE from "three";

export const YAW_STEPS = 4;
const PITCH = Math.atan(1 / Math.SQRT2); // classic isometric-ish, ~35.26°

export function createCamera(aspect) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const view = {
    camera,
    targetX: 0,
    targetZ: 0,
    /** Tiles visible across the shorter screen axis. The only zoom control. */
    span: 40,
    yawStep: 0,
    yaw: 0,
    aspect,
  };
  applyZoom(view, aspect);
  applyPose(view);
  return view;
}

export function applyZoom(view, aspect) {
  view.aspect = aspect;
  const half = view.span / 2;
  const halfX = aspect >= 1 ? half * aspect : half;
  const halfY = aspect >= 1 ? half : half / aspect;
  view.camera.left = -halfX;
  view.camera.right = halfX;
  view.camera.top = halfY;
  view.camera.bottom = -halfY;
  view.camera.updateProjectionMatrix();
}

/** Places the camera on its orbit. Distance is fixed and large: an orthographic
 * camera does not care, and a far camera keeps the whole map inside the near
 * and far planes at every zoom. */
export function applyPose(view) {
  const distance = 1200;
  const x = view.targetX + Math.sin(view.yaw) * Math.cos(PITCH) * distance;
  const y = Math.sin(PITCH) * distance;
  const z = view.targetZ + Math.cos(view.yaw) * Math.cos(PITCH) * distance;
  view.camera.position.set(x, y, z);
  view.camera.up.set(0, 1, 0);
  view.camera.lookAt(view.targetX, 0, view.targetZ);
  view.camera.updateMatrixWorld();
}

export function setYawStep(view, step) {
  view.yawStep = ((step % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
  view.yaw = (view.yawStep * Math.PI) / 2;
  applyPose(view);
}

export function rotate(view, direction) {
  setYawStep(view, view.yawStep + (direction > 0 ? 1 : -1));
}

export function focusOn(view, x, z) {
  view.targetX = x;
  view.targetZ = z;
  applyPose(view);
}

export function zoomBy(view, factor, limits) {
  const min = limits?.min ?? 8;
  const max = limits?.max ?? 160;
  view.span = Math.max(min, Math.min(max, view.span * factor));
  applyZoom(view, view.aspect);
}

export function panBy(view, dx, dz) {
  // Pan in screen space, not world space: dragging right must move the map
  // right whichever way the camera is facing.
  const cos = Math.cos(view.yaw);
  const sin = Math.sin(view.yaw);
  view.targetX += dx * cos - dz * sin;
  view.targetZ += dx * sin + dz * cos;
  applyPose(view);
}

/** Keeps the camera over the map, with a margin so the edge can be inspected. */
export function clampToMap(view, width, height, margin = 6) {
  view.targetX = Math.max(-margin, Math.min(width + margin, view.targetX));
  view.targetZ = Math.max(-margin, Math.min(height + margin, view.targetZ));
  applyPose(view);
}
