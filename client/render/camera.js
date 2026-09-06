// One view, two projections, four snapped yaw angles.
//
// Rotation is a hard requirement (ruling 006), and snapped rather than free
// because the design asks for "comfortable angles" rather than disorienting
// freedom. Ruling 034 amends it: **perspective is the play camera** and
// orthographic stays as a mode, because what 006 protected was being able to
// look behind a building and mobile and desktop seeing the same city — not the
// projection itself, which was chosen when a sprite pipeline was still possible
// and 022 chose meshes.
//
// `span` remains the single zoom control in both. Under perspective the eye
// distance is derived from it, so switching projection does not jump the view;
// that is what makes the setting a preference rather than a different game.

import * as THREE from "three";

export const YAW_STEPS = 4;

/** Modes, as ruling 034 names them. `street` arrives with E4. */
export const MODES = ["city", "ortho"];

/** Vertical field of view for the perspective camera, degrees. Wide enough to
 * feel like a place, narrow enough that the edges do not smear. */
const FOV = 50;
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

export function createCamera(aspect, mode = "city") {
  const view = {
    ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000),
    persp: new THREE.PerspectiveCamera(FOV, aspect, 0.5, 4000),
    mode: MODES.includes(mode) ? mode : "city",
    fov: FOV,
    targetX: 0,
    targetZ: 0,
    /** Tiles visible across the shorter screen axis. The only zoom control, in
     * both projections. */
    span: 40,
    yawStep: 0,
    yaw: 0,
    pitch: PITCH,
    aspect,
  };
  view.camera = view.mode === "ortho" ? view.ortho : view.persp;
  applyZoom(view, aspect);
  applyPose(view);
  return view;
}

/** How many tiles fill the screen VERTICALLY.
 *
 * `span` is tiles across the shorter axis — the same meaning the orthographic
 * camera has given it since the first renderer — so on a landscape screen that
 * is the height and on a portrait phone it is the width. Perspective has to
 * agree, because three's field of view is vertical: deriving the eye distance
 * from `span` on a portrait screen put the phone's camera at the wrong distance
 * and every drag on it missed (slice V5). */
export function verticalSpan(view) {
  return view.aspect >= 1 ? view.span : view.span / view.aspect;
}

/** How far the eye sits from the orbit target so that a tile AT THE TARGET is
 * the same size as the orthographic camera would draw it.
 *
 * The vertical extent subtends `fov`, so the distance is half of it over the
 * tangent of half the angle. Deriving it rather than storing it is what makes
 * `setMode` free of a jump. */
export function eyeDistance(view) {
  return verticalSpan(view) / (2 * Math.tan((view.fov * Math.PI) / 360));
}

/** Swaps the projection and re-poses. Everything else about the view — target,
 * yaw, pitch, span — is shared, so the city does not move. */
export function setMode(view, mode) {
  if (!MODES.includes(mode) || view.mode === mode) return view.mode;
  view.mode = mode;
  view.camera = mode === "ortho" ? view.ortho : view.persp;
  applyZoom(view, view.aspect);
  applyPose(view);
  return view.mode;
}

export function applyZoom(view, aspect) {
  view.aspect = aspect;
  const half = view.span / 2;
  const halfX = aspect >= 1 ? half * aspect : half;
  const halfY = aspect >= 1 ? half : half / aspect;
  const ortho = view.ortho ?? view.camera;
  ortho.left = -halfX;
  ortho.right = halfX;
  ortho.top = halfY;
  ortho.bottom = -halfY;
  ortho.updateProjectionMatrix();
  if (view.persp) {
    view.persp.aspect = aspect;
    view.persp.fov = view.fov;
    // Far enough to see the whole of a 128-tile map from a low pitch, near
    // enough that the depth buffer still separates a kerb from the road.
    view.persp.far = 4000;
    view.persp.updateProjectionMatrix();
  }
  // Under perspective the eye distance follows the span, so a zoom is a move.
  if (view.mode === "city") applyPose(view);
}

/** Places the camera on its orbit. Distance is fixed and large: an orthographic
 * camera does not care, and a far camera keeps the whole map inside the near
 * and far planes at every zoom. */
export function applyPose(view) {
  // Orthographic does not care how far away the eye is, only which way it
  // looks, so it sits far enough out to keep the whole map inside its near and
  // far planes at every zoom. Perspective cares a great deal: its distance IS
  // the zoom (ruling 034).
  const distance = view.mode === "city" ? eyeDistance(view) : 1200;
  const pitch = view.pitch ?? PITCH;
  const x = view.targetX + Math.sin(view.yaw) * Math.cos(pitch) * distance;
  const y = Math.sin(pitch) * distance;
  const z = view.targetZ + Math.cos(view.yaw) * Math.cos(pitch) * distance;
  const camera = view.camera;
  camera.position.set(x, y, z);
  camera.up.set(0, 1, 0);
  camera.lookAt(view.targetX, 0, view.targetZ);
  camera.updateMatrixWorld();
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
