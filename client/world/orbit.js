// Where the eye is (slice R1, finding 6).
//
// The camera poses itself from target, yaw, pitch, span and the ground height
// under the target; the LOD prices the frame from the same five numbers; and
// until this module there were two copies of the arithmetic. They disagreed
// once already — `applyPose` orbited `view.groundY` and `tilePixels` orbited
// `y = 0`, so on a map with fifty metres of relief the budget was measured from
// a camera that was not where the camera was.
//
// Pure, and in `client/world/` rather than beside the camera, for the reason
// everything else here is: node can load it, and `camera.js` cannot.
//
// TILE units throughout, which is what the scene is in.

/** How many tiles fill the screen VERTICALLY.
 *
 * `span` is tiles across the shorter axis — the meaning it has had since the
 * first renderer — so on a landscape screen that is the height and on a
 * portrait phone it is the width. Perspective has to agree, because three's
 * field of view is vertical: deriving the eye distance from `span` on a
 * portrait screen put the phone's camera at the wrong distance and every drag
 * on it missed (slice V5). */
export function verticalSpan(view) {
  const aspect = view.aspect ?? 1;
  return aspect >= 1 ? view.span : view.span / aspect;
}

/** How far the eye sits from the orbit target so a tile AT THE TARGET is the
 * size the orthographic camera would draw it. Derived rather than stored, which
 * is what makes switching projection free of a jump. */
export function eyeDistance(view) {
  return verticalSpan(view) / (2 * Math.tan(((view.fov ?? 50) * Math.PI) / 360));
}

/** The default pitch: classic isometric-ish, about 35.26°. */
export const PITCH = Math.atan(1 / Math.SQRT2);

/**
 * Where the eye is and which way it looks.
 *
 * Four modes, one answer. In `city` the eye is on the orbit at `eyeDistance`
 * from the target, raised by the ground under it. In `ortho` the eye direction
 * is the same and the distance does not matter — an orthographic camera cares
 * only which way it looks — so it is placed far enough out to keep the map
 * inside its planes. In `street` the WALKER is the eye and the direction comes
 * from its own yaw and pitch, and `photo` is the same arithmetic with a player
 * holding the camera instead of a walker carrying it (F1).
 */
export function eyeOf(view) {
  const pitch = view.pitch ?? PITCH;
  const ground = view.groundY ?? 0;
  // The two free-look modes, which are the same arithmetic: the eye is where it
  // was put and the direction comes from its own yaw and pitch. `street` is a
  // walker and `photo` is a player holding a camera (F1); neither is on an
  // orbit, and giving them separate answers is how R1.6's two copies of this
  // disagreed in the first place.
  if (view.mode === "street" || view.mode === "photo") {
    const e = view.eye ?? { x: view.targetX, y: ground, z: view.targetZ };
    const cp = Math.cos(pitch);
    return {
      x: e.x, y: e.y, z: e.z,
      fx: -Math.sin(view.yaw) * cp, fy: Math.sin(pitch), fz: -Math.cos(view.yaw) * cp,
      ground,
    };
  }
  const distance = view.mode === "ortho" ? ORTHO_DISTANCE : eyeDistance(view);
  const x = view.targetX + Math.sin(view.yaw) * Math.cos(pitch) * distance;
  const y = ground + Math.sin(pitch) * distance;
  const z = view.targetZ + Math.cos(view.yaw) * Math.cos(pitch) * distance;
  const fx = view.targetX - x;
  const fy = ground - y;
  const fz = view.targetZ - z;
  const len = Math.hypot(fx, fy, fz) || 1;
  return { x, y, z, fx: fx / len, fy: fy / len, fz: fz / len, ground };
}

/** Far enough out that the whole map is inside the orthographic camera's near
 * and far planes at every zoom. It has no other effect. */
export const ORTHO_DISTANCE = 1200;
