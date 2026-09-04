// Orthographic low-isometric camera with four snapped yaw angles.
//
// Rotation is a hard requirement (ruling 006), and snapped rather than free
// because the design asks for "comfortable angles" rather than disorienting
// freedom. Four angles also means a future sprite pipeline stays expressible.

import * as THREE from "three";

export const YAW_STEPS = 4;
const PITCH = Math.atan(1 / Math.SQRT2); // classic isometric-ish, ~35.26°

/** How far the camera may be tilted, in radians from the ground plane.
 *
 * Ruling 006 fixed the pitch at PITCH and the second playtest asked to be able
 * to drop it "closer to the ground", which is a deliberate amendment rather
 * than a slip: the four snapped YAW angles the ruling is really about are
 * untouched and still what Q and E give.
 *
 * Neither end is arbitrary. Below about 12° a city is seen edge-on and the
 * front row hides everything behind it; at exactly 90° the view direction is
 * parallel to the up vector and `lookAt` has no answer, so the top end stops
 * short of straight down. */
const MIN_PITCH = 12 * (Math.PI / 180);
const MAX_PITCH = 82 * (Math.PI / 180);

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
    pitch: PITCH,
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
  const pitch = view.pitch ?? PITCH;
  const x = view.targetX + Math.sin(view.yaw) * Math.cos(pitch) * distance;
  const y = Math.sin(pitch) * distance;
  const z = view.targetZ + Math.cos(view.yaw) * Math.cos(pitch) * distance;
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

/** A key press, which SNAPS. From a free angle the mouse left behind, the step
 * is measured from where the camera actually is — so Q and E are also the way
 * back onto the four comfortable angles, not a jump to a remembered one. */
export function rotate(view, direction) {
  const here = Math.round(view.yaw / (Math.PI / 2));
  setYawStep(view, here + (direction > 0 ? 1 : -1));
}

/** A drag, which does not snap. Wrapped, or a player who spins the camera for
 * a minute accumulates a yaw large enough to lose precision in. */
export function yawBy(view, radians) {
  const full = Math.PI * 2;
  view.yaw = ((view.yaw + radians) % full + full) % full;
  view.yawStep = Math.round(view.yaw / (Math.PI / 2)) % YAW_STEPS;
  applyPose(view);
}

/** Tilt, between the horizon and almost straight down. */
export function pitchBy(view, radians) {
  view.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, (view.pitch ?? PITCH) + radians));
  applyPose(view);
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
