// The photo camera (slice F1, `specs/plan.md` §10 bonus 4).
//
// A free camera: the eye goes where the player puts it, looks where they point
// it, and obeys neither the orbit nor the ground. It is the fourth mode of
// ruling 034 and the only one that can take a shot the game could not otherwise
// take — over a roof looking down, at the waterline, along a street from the
// height of a first floor.
//
// Pure, and in `client/world/` rather than beside `camera.js`, for the reason
// everything else here is: node can load this and three cannot be loaded at
// all. The camera module does the posing; this decides where the eye goes.
//
// TILE units, like the rest of `client/world/`. The convention for direction is
// the one `orbit.js` already uses for the street camera, so the two agree:
// forward is `(-sin yaw · cos pitch, sin pitch, -cos yaw · cos pitch)`.

/** How many seconds it takes to fly across the visible span.
 *
 * The speed follows the zoom rather than being a fixed number of tiles a
 * second, so the control means the same thing from the air and from the
 * pavement — six seconds to cross what you can see, whatever you can see. A
 * fixed speed is either unusable at a span of 4 or unusable at 160. */
export const PHOTO_CROSS_SECONDS = 6;

/** What the fast modifier multiplies by. Three, because it is for repositioning
 * across a city rather than for framing, and anything much more is a teleport
 * that overshoots whatever the player was aiming at. */
export const PHOTO_FAST = 3;

/** How far from level the camera may look.
 *
 * 88°, not 90: at exactly straight down the view direction is parallel to the
 * up vector and `lookAt` has no answer — the same reason `camera.js` stops the
 * orbit at 82° from the other side. The extra six degrees are the point of the
 * mode: an orbit camera cannot hang over a roof and look at it. */
export const PHOTO_MAX_PITCH = 88 * (Math.PI / 180);

/** Tiles a second at this zoom. */
export function photoSpeed(span) {
  return span / PHOTO_CROSS_SECONDS;
}

/**
 * Where the eye goes this frame.
 *
 * `move` is `{ forward, strafe, fast }` — the same shape `client/input/`
 * already builds for the walker, so the controller has one answer for both.
 * `dt` is the caller's delta, which is what makes the camera a rate rather than
 * a function of the frame rate (D7's lesson, applied before it could be made
 * again).
 */
export function photoStep(eye, yaw, pitch, move, dt, span) {
  const forward = move?.forward ?? 0;
  const strafe = move?.strafe ?? 0;
  if (forward === 0 && strafe === 0) return eye;

  // Normalised, so a diagonal is not faster than a straight line — the oldest
  // bug there is in a free camera.
  const length = Math.hypot(forward, strafe);
  const f = forward / length;
  const s = strafe / length;

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);

  // Forward follows the look, pitch included: there is no other way up or down,
  // and a camera that can only fly level cannot take the shot the mode is for.
  // Strafe stays horizontal, or sidestepping while looking at the ground would
  // fly into it.
  const dx = f * (-sy * cp) + s * (-cy);
  const dy = f * sp;
  const dz = f * (-cy * cp) + s * sy;

  const step = photoSpeed(span) * (move?.fast ? PHOTO_FAST : 1) * dt;
  return { x: eye.x + dx * step, y: eye.y + dy * step, z: eye.z + dz * step };
}

/** Where the camera looks after a mouse movement: yaw wrapped, pitch clamped. */
export function photoLook(yaw, pitch, dYaw, dPitch) {
  const full = Math.PI * 2;
  return {
    yaw: (((yaw + dYaw) % full) + full) % full,
    pitch: Math.max(-PHOTO_MAX_PITCH, Math.min(PHOTO_MAX_PITCH, pitch + dPitch)),
  };
}
