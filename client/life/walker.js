// The walker (slice E4; spec §8.1, ruling 034).
//
// `client/life/` and not `client/render/`: it remembers where it is between
// frames, it takes its time as a delta from the caller, and it touches neither
// three nor the DOM — so `?life=0` freezes it like it freezes the traffic, and
// node can walk it into a wall in a unit test. The camera reads `pose` and
// poses itself; nothing here knows a camera exists.
//
// Metres throughout. The scene is in tile units and `camera.js` divides.

const EYE = 1.62;
const RADIUS = 0.34;
const HEIGHT = 1.7;
const WALK = 1.6;
const RUN = 4;
/** Not 90°: at exactly straight up the view direction is parallel to the up
 * vector and `lookAt` has no answer — the same reason the city camera stops
 * at 82°. */
const MAX_PITCH = 85 * (Math.PI / 180);
/** How close is "there", and how fast a tap turns the walker, in radians a
 * second. A tap two metres away should not spin anybody round. */
const ARRIVED = 1;
const TURN = 2.5;

export function createWalker(collision, options = {}) {
  const eye = options.eye ?? EYE;
  const radius = options.radius ?? RADIUS;
  const height = options.height ?? HEIGHT;
  const walkSpeed = options.walk ?? WALK;
  const runSpeed = options.run ?? RUN;

  // `foot` is the ground the walker stands on; `pose.y` is the eye above it.
  const pose = { x: 0, y: eye, z: 0, yaw: 0, pitch: 0 };
  let foot = 0;
  /** Where a tap said to go. Touch has no keyboard and a virtual stick on a
   * phone is a thumb over the thing you are trying to look at, so the coarse
   * pointer walks by tapping the ground (spec §8.1). */
  let goal;
  /** How many steps the collision world has pushed back. Read by the gates:
   * a walkthrough that never touches a wall is measuring an empty field, and
   * that is the shape of instrument failure this project keeps finding. */
  let blocked = 0;

  function settle() {
    foot = collision.floorAt(pose.x, pose.z) ?? foot;
    pose.y = foot + eye;
  }

  /** Where the walker is looking, on the ground plane.
   *
   * The city camera puts its EYE at `+sin(yaw), +cos(yaw)` from its target, so
   * the direction it looks is the negative of that. Sharing the convention is
   * what makes entering street mode keep the heading the player had. */
  function forwardOf(yaw) {
    return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  }

  function look(dYaw, dPitch) {
    const full = Math.PI * 2;
    pose.yaw = ((pose.yaw + dYaw) % full + full) % full;
    pose.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pose.pitch + dPitch));
    return pose;
  }

  return {
    pose,
    get foot() { return foot; },
    get radius() { return radius; },
    get blocked() { return blocked; },

    get goal() { return goal; },

    /** Walk towards a point until it is reached or the way is blocked. */
    seek(x, z) { goal = { x, z }; },
    stop() { goal = undefined; },

    teleport(x, z, yaw = pose.yaw, pitch = 0) {
      goal = undefined;
      pose.x = x;
      pose.z = z;
      pose.yaw = yaw;
      pose.pitch = pitch;
      settle();
      return pose;
    },

    look,

    /**
     * One step. `move` is `{ forward, strafe, run }` with the two axes in
     * [-1, 1]; a diagonal is normalised, or the corners of the city would be
     * forty per cent faster to reach than its streets.
     */
    update(dt, move = {}) {
      let f = move.forward ?? 0;
      let s = move.strafe ?? 0;
      // A tap is an instruction, not a key: a held key outranks it, and
      // arriving cancels it.
      if (goal && f === 0 && s === 0) {
        const dx = goal.x - pose.x;
        const dz = goal.z - pose.z;
        if (Math.hypot(dx, dz) <= ARRIVED) { goal = undefined; return pose; }
        // Turn towards it rather than snapping: a camera that whips round is
        // the difference between walking and being dragged.
        const want = Math.atan2(-dx, -dz);
        const delta = ((want - pose.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const turn = Math.max(-TURN * dt, Math.min(TURN * dt, delta));
        look(turn, 0);
        f = 1;
      } else if (goal) goal = undefined;
      if (dt <= 0 || (f === 0 && s === 0)) return pose;

      const len = Math.hypot(f, s) || 1;
      const speed = (move.run ? runSpeed : walkSpeed) * dt;
      const fwd = forwardOf(pose.yaw);
      // Right of forward, in the ground plane.
      const rx = -fwd.z;
      const rz = fwd.x;
      const wantX = pose.x + ((fwd.x * f + rx * s) / len) * speed;
      const wantZ = pose.z + ((fwd.z * f + rz * s) / len) * speed;

      const clear = collision.resolve({ x: wantX, y: foot, z: wantZ }, radius, height);
      // Walked into something while following a tap: the instruction is over.
      // Without this the walker grinds against a wall for as long as the goal
      // is unreachable, which is every tap through a building.
      if (clear.hit) blocked += 1;
      if (goal && clear.hit) goal = undefined;
      // A step too tall to climb is a wall made of ground. Refuse the move
      // rather than teleporting the eye up a cliff.
      const floor = collision.floorAt(clear.x, clear.z, foot);
      if (floor === undefined) return pose;

      pose.x = clear.x;
      pose.z = clear.z;
      foot = floor;
      pose.y = foot + eye;
      return pose;
    },
  };
}
