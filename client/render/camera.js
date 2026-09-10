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
import { eyeOf, verticalSpan, eyeDistance, PITCH, ORTHO_DISTANCE } from "../world/orbit.js";

export const YAW_STEPS = 4;

/** Modes, as ruling 034 names them, plus the photo camera F1 adds.
 *
 * `photo` is `street` without a walker: the eye is where the player put it and
 * the look is its own, so `orbit.js` gives the two the same answer and only the
 * limits differ — no collision, no gravity, and a pitch that reaches 88° so a
 * camera can hang over a roof and look at it. */
export const MODES = ["city", "ortho", "street", "photo"];

/** The modes whose eye is its own rather than a point on the orbit. */
const FREE_LOOK = new Set(["street", "photo"]);

/** Where the photo camera stops taking the street's near and far planes and
 * starts taking the city's, in TILES of eye height. The same threshold the fog
 * uses (`atmosphere.js`), and for the same reason: down among the buildings a
 * near plane of half a tile clips the kerb the camera is standing on. */
const PHOTO_AIR_ABOVE = 1;

/** Vertical field of view for the perspective camera, degrees. Wide enough to
 * feel like a place, narrow enough that the edges do not smear. */
const FOV = 50;
// PITCH comes from `orbit.js`, which is where the eye arithmetic is (R1.6).

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
  /** The walker's eye in tile units, in street mode only (slice E4). */
  view.eye = undefined;
  applyZoom(view, aspect);
  applyPose(view);
  return view;
}

// `verticalSpan` and `eyeDistance` live in `client/world/orbit.js` now, with
// the eye arithmetic they belong to (R1.6). Re-exported, because the whole
// renderer already imports them from here.
export { verticalSpan, eyeDistance };

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
    //
    // Street mode moves both. A near plane of 0.5 TILES is ten metres: from
    // eye height it would clip the pavement, the kerb and the front of every
    // building the walker is standing next to. And a far plane of 4,000 tiles
    // is eighty kilometres of depth range spent on a city that ends at the fog
    // (slice E4).
    applyPlanes(view);
  }
  // Under perspective the eye distance follows the span, so a zoom is a move.
  if (view.mode !== "ortho") applyPose(view);
}

/** Places the camera on its orbit. Distance is fixed and large: an orthographic
 * camera does not care, and a far camera keeps the whole map inside the near
 * and far planes at every zoom. */
/**
 * The near and far planes for where the eye actually is.
 *
 * The photo camera takes the street's pair near the ground and the city's in
 * the air (F1): at eye height a near plane of half a tile clips the pavement
 * the camera is standing on, and from above the city a far plane of a hundred
 * tiles ends the world halfway to the horizon.
 *
 * Called from `applyPose` rather than only from `applyZoom`, and that is the
 * point: a photo camera's eye can be set by anything — flown, jumped to, or
 * placed by a shot list — and planes that were only recomputed on the way
 * through one of those paths are stale on every other. `budget_gate`'s photo
 * row put the eye down at street level directly and got the city's planes,
 * which is the whole argument in one measurement.
 */
function applyPlanes(view) {
  if (!view.persp) return;
  const nearGround = view.mode === "street"
    || (view.mode === "photo" && (view.eye?.y ?? Infinity) <= PHOTO_AIR_ABOVE);
  const near = nearGround ? 0.02 : 0.5;
  const far = nearGround ? 100 : 4000;
  if (view.persp.near === near && view.persp.far === far) return;
  view.persp.near = near;
  view.persp.far = far;
  view.persp.updateProjectionMatrix();
}

export function applyPose(view) {
  applyPlanes(view);
  const eye = eyeOf(view);
  const camera = view.camera;
  camera.position.set(eye.x, eye.y, eye.z);
  camera.up.set(0, 1, 0);
  if (FREE_LOOK.has(view.mode)) {
    // The eye IS the camera, so it looks along its own heading rather than at
    // an orbit target — the walker in street mode, the player in photo.
    camera.lookAt(eye.x + eye.fx, eye.y + eye.fy, eye.z + eye.fz);
    camera.updateMatrixWorld();
    return;
  }
  // Orthographic does not care how far away the eye is, only which way it
  // looks, so it sits far enough out to keep the whole map inside its near and
  // far planes at every zoom. Perspective cares a great deal: its distance IS
  // the zoom (ruling 034).
  camera.lookAt(view.targetX, eye.ground, view.targetZ);
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
