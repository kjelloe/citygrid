// The camera cluster, as data (slice K1, ruling 042).
//
// Every camera movement exists and a player finds out about most of them from
// the help card or not at all: right-drag orbits, middle-drag pans, Q and E
// snap, arrows nudge, F stands in the street. Ruling 042 says every one of them
// has a button on the screen, in one cluster, in every mode.
//
// This is the table both halves read. `camera-cluster.js` builds the DOM from
// it, `client/input/controller.js` binds the same keys, and `help-model.js`
// derives the card — the way the build tools are derived from `TOOLS`, and for
// the same reason: a key documented in one place and bound in another drifts
// the moment somebody adds a third.
//
// Pure and node-loadable. No DOM, no three, no controller.

/** The camera modes a button can appear in. `ortho` and `city` differ only in
 * projection, so a button that works in one works in the other. */
export const CAMERA_MODES = ["city", "ortho", "street", "photo"];

/** How long the pad takes to cross the visible span while a button is held.
 *
 * A rate per second, scaled by the caller's delta (ruling 042 §3, and D7's
 * lesson): a button held for a second moves the same distance at any frame
 * rate. Four seconds is brisk enough to cross a city without being a control
 * you have to feather. */
export const PAN_SECONDS = 4;

/** Radians a second while rotate or tilt is held. A quarter turn in about a
 * second and a half, which is the speed the mouse drag already gives at a
 * comfortable hand movement. */
export const TURN_PER_SECOND = 1.1;

/** Zoom is multiplicative: this many doublings a second while held. */
export const ZOOM_PER_SECOND = 1.2;

/**
 * One button.
 *
 * `key` is the keyboard equivalent, and `scope` says where that key means this:
 * `any` is every mode, and a mode name is that mode only. The scope is what
 * lets `W` be the wire tool in the city and forward in the street without the
 * two being a collision — and what makes a real collision, like the one F1
 * caused by taking `P` from the pipe tool, something a test can see.
 *
 * `repeats` marks a button that acts while held rather than once per press.
 * `intent` is what the controller is asked to do; the cluster never reaches
 * into the camera itself, so a button and a key cannot disagree (ruling 042 §1).
 */
export const CAMERA_BUTTONS = [
  {
    id: "pan", intent: "pan", labelKey: "camera.pan", hintKey: "camera.pan.hint",
    keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], scope: "any",
    repeats: true, rate: PAN_SECONDS, modes: ["city", "ortho", "street", "photo"],
    // The pad is a pan in the city, a walk in the street and a flight in photo
    // mode. One control, three labels — the label is what changes, not the
    // button, because it is the same intent about the same hand.
    labelPerMode: { street: "camera.pad.walk", photo: "camera.pad.fly" },
  },
  {
    id: "rotate-left", intent: "rotate", direction: -1,
    labelKey: "camera.rotateLeft", hintKey: "camera.rotate.hint",
    keys: ["q"], scope: "any", repeats: true, rate: TURN_PER_SECOND,
    modes: ["city", "ortho"],
  },
  {
    id: "rotate-right", intent: "rotate", direction: 1,
    labelKey: "camera.rotateRight", hintKey: "camera.rotate.hint",
    keys: ["e"], scope: "any", repeats: true, rate: TURN_PER_SECOND,
    modes: ["city", "ortho"],
  },
  {
    id: "tilt-up", intent: "tilt", direction: 1,
    labelKey: "camera.tiltUp", hintKey: "camera.tilt.hint",
    keys: ["PageUp"], scope: "any", repeats: true, rate: TURN_PER_SECOND,
    modes: ["city", "street", "photo"],
    labelPerMode: { street: "camera.lookUp", photo: "camera.lookUp" },
  },
  {
    id: "tilt-down", intent: "tilt", direction: -1,
    labelKey: "camera.tiltDown", hintKey: "camera.tilt.hint",
    keys: ["PageDown"], scope: "any", repeats: true, rate: TURN_PER_SECOND,
    modes: ["city", "street", "photo"],
    labelPerMode: { street: "camera.lookDown", photo: "camera.lookDown" },
  },
  {
    id: "zoom-in", intent: "zoom", direction: -1,
    labelKey: "camera.zoomIn", hintKey: "camera.zoom.hint",
    keys: ["+", "="], scope: "any", repeats: true, rate: ZOOM_PER_SECOND,
    modes: ["city", "ortho", "photo"],
  },
  {
    id: "zoom-out", intent: "zoom", direction: 1,
    labelKey: "camera.zoomOut", hintKey: "camera.zoom.hint",
    keys: ["-"], scope: "any", repeats: true, rate: ZOOM_PER_SECOND,
    modes: ["city", "ortho", "photo"],
  },
  {
    // **`h`, not the `Space` the work item asked for.** Space toggles the game
    // speed, is on the help card, and is the most-used key in the game; taking
    // it to disambiguate a rarely-used pan would degrade the common control to
    // serve the rare one. `collisions()` is what made the clash visible before
    // it was written rather than after (K3).
    id: "hand", intent: "hand", labelKey: "camera.hand", hintKey: "camera.hand.hint",
    keys: ["h"], scope: "any", repeats: false, modes: ["city", "ortho"],
  },
  {
    id: "home", intent: "home", labelKey: "camera.home", hintKey: "camera.home.hint",
    keys: ["Home"], scope: "any", repeats: false,
    modes: ["city", "ortho", "street", "photo"],
  },
  {
    id: "street", intent: "street", labelKey: "street.enter", hintKey: "street.enter.hint",
    keys: ["f"], scope: "any", repeats: false, modes: ["city", "ortho", "street"],
    labelPerMode: { street: "street.leave" },
    hintPerMode: { street: "street.leave.hint" },
  },
  {
    id: "photo", intent: "photo", labelKey: "photo.enter", hintKey: "photo.enter.hint",
    // **`c`, not `p`.** `p` is the pipe tool's shortcut and F1 took it, which
    // silently stopped the pipe from being selectable by keyboard — a key that
    // stops working is the quietest defect there is. `collisions()` below is
    // what makes the next one loud.
    keys: ["c"], scope: "any", repeats: false,
    modes: ["city", "ortho", "street", "photo"],
    labelPerMode: { photo: "photo.leave" },
    hintPerMode: { photo: "photo.leave.hint" },
  },
];

/** The four compass points, in the order `view.yawStep` counts them (K4).
 *
 * Which way is north is a decision, not an observation: the world's +Z is south
 * on the map, so step 0 — the default yaw the city opens at — is looking north.
 * A compass that is a picture rather than a control (ruling 028's minimap
 * precedent) still has to be RIGHT, and this is the only place that says so. */
export const COMPASS_POINTS = ["compass.n", "compass.e", "compass.s", "compass.w"];

/** Which way the view is facing, as a catalogue key and a rotation in degrees.
 *
 * The rotation is the free yaw, not the snapped step, so the needle follows a
 * mouse orbit rather than jumping between four positions — the amendment to
 * ruling 006 is that the camera may sit between the angles, and a compass that
 * cannot show that is a compass that lies for three quarters of every turn. */
export function facing(yaw = 0) {
  const quarter = Math.PI / 2;
  const step = ((Math.round(yaw / quarter) % 4) + 4) % 4;
  return {
    labelKey: COMPASS_POINTS[step],
    degrees: (yaw * 180) / Math.PI,
  };
}

/** The label this button carries in this mode. */
export function labelFor(button, mode) {
  return button.labelPerMode?.[mode] ?? button.labelKey;
}

/** And the hint, which changes with it: a button that says "Leave photo mode"
 * must not be explained by the hint for entering it. */
export function hintFor(button, mode) {
  return button.hintPerMode?.[mode] ?? button.hintKey;
}

/** The buttons the cluster shows in a mode, in order. */
export function buttonsFor(mode) {
  return CAMERA_BUTTONS.filter((b) => b.modes.includes(mode));
}

/**
 * Every key this table claims, as `{ key, scope, id }`.
 *
 * Lower-cased for letters, because a shortcut is found whatever the shift state
 * (`toolForKey`'s rule, and the same one here).
 */
export function cameraKeys() {
  const out = [];
  for (const button of CAMERA_BUTTONS) {
    for (const key of button.keys) {
      out.push({ key: key.length === 1 ? key.toLowerCase() : key, scope: button.scope, id: button.id });
    }
  }
  return out;
}

/**
 * Keys claimed by two things that are live at the same time.
 *
 * Two bindings collide when their scopes overlap: `any` overlaps everything, a
 * mode overlaps itself. That is what lets `W` be the wire tool in the city and
 * forward in the street — different scopes, one key, no collision — while
 * taking `P` from the pipe tool for a camera mode is a real one.
 *
 * `others` is `{ key, scope, id }` from anywhere else that binds keys; the
 * caller passes the build tools in, because `client/input/tools.js` is the
 * input layer's and this module is the interface's, and neither should import
 * the other to answer a question a test is asking.
 */
export function collisions(others = []) {
  const all = [...cameraKeys(), ...others];
  const overlap = (a, b) => a.scope === "any" || b.scope === "any" || a.scope === b.scope;
  const found = [];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].key !== all[j].key) continue;
      if (all[i].id === all[j].id) continue;
      if (!overlap(all[i], all[j])) continue;
      found.push(`${all[i].key}: ${all[i].id} (${all[i].scope}) and ${all[j].id} (${all[j].scope})`);
    }
  }
  return found;
}
