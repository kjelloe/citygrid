// What the mouse buttons mean, per mode (slice K3, ruling 042 §2).
//
// Kjell asked for this by name: "navigation around the world needs to be easier
// via on screen keys and mouse left-and-right mouse button." Today a mouse-only
// player cannot move in the street at all — the mouse looks and the keyboard
// walks — and in the city the only pan with a tool in hand is the middle
// button, which a trackpad may not have.
//
// A pure table, in the input layer and loadable by node, because the alternative
// is a nest of conditions inside three pointer handlers that nobody can read and
// no test can plant a combination into. `controller.js` asks this what a gesture
// means and then does it.
//
// The button set is the one `PointerEvent.buttons` gives: 1 left, 2 right,
// 4 middle. Named here so a caller never writes the bit pattern twice.

export const LEFT = 1;
export const RIGHT = 2;
export const MIDDLE = 4;

/** What a drag does. `tool` means the pointer belongs to the build tool and the
 * camera keeps out of it. */
export const INTENT = {
  none: "none",
  tool: "tool",
  pan: "pan",
  orbit: "orbit",
  dolly: "dolly",
  walk: "walk",
};

/**
 * What this combination of buttons means in this mode.
 *
 * `hand` is the pan override — the cluster's hand toggle, or `Space` held —
 * which turns the left button into a pan even with a tool selected. It is the
 * answer to the one gap ruling 042 §2 names: with a tool in hand there is no
 * way to pan by mouse except the middle button.
 *
 * Returns `{ intent, forward, run, look }`. `forward` is -1, 0 or 1 for the
 * free-look modes; `look` says whether pointer movement turns the view, which
 * in the free-look modes is true whenever anything is held.
 */
export function buttonsToIntent(mode, buttons = 0, { hasTool = false, hand = false } = {}) {
  const left = (buttons & LEFT) !== 0;
  const right = (buttons & RIGHT) !== 0;
  const middle = (buttons & MIDDLE) !== 0;
  const free = mode === "street" || mode === "photo";

  if (free) {
    // Left walks forward, right walks back, both run. Movement while any button
    // is held looks — which is today's drag-look, and stays the fallback where
    // pointer lock is refused (A58).
    const forward = (left ? 1 : 0) - (right ? 1 : 0);
    const anyHeld = left || right || middle;
    return {
      intent: left || right ? INTENT.walk : INTENT.none,
      forward,
      // Both together is a run, and it is a run FORWARD: two buttons cancelling
      // to a standstill would be the least useful thing they could mean.
      run: left && right,
      look: anyHeld,
    };
  }

  // The city and the orthographic view.
  if (middle) return { intent: INTENT.pan, forward: 0, run: false, look: false };
  if (left && right) return { intent: INTENT.dolly, forward: 0, run: false, look: false };
  if (right) return { intent: INTENT.orbit, forward: 0, run: false, look: false };
  if (left) {
    // A tool in hand owns the left button — unless the hand is down, which is
    // what the hand is for.
    if (hand) return { intent: INTENT.pan, forward: 0, run: false, look: false };
    return { intent: hasTool ? INTENT.tool : INTENT.pan, forward: 0, run: false, look: false };
  }
  return { intent: INTENT.none, forward: 0, run: false, look: false };
}

/** Every combination this table answers for, for a test to walk. */
export function allCombinations() {
  const out = [];
  for (const buttons of [0, LEFT, RIGHT, MIDDLE, LEFT | RIGHT, LEFT | MIDDLE, RIGHT | MIDDLE, LEFT | RIGHT | MIDDLE]) {
    out.push(buttons);
  }
  return out;
}

/**
 * Does pointer movement turn the view right now (A58)?
 *
 * The whole of Kjell's "freelook without buttons": **with the lock, looking
 * needs nothing held; without it, it is the drag-look Q43 chose.** Pointer Lock
 * needs a user gesture and is refused outright in a cross-origin frame, so the
 * fallback is not a lesser mode — it is the path a player in an embedded page
 * gets, and both are gated.
 *
 * Pure and here rather than inside the pointer handler, because "which of the
 * two paths am I on" is the one thing about this feature a test can hold still.
 */
export function looksNow(mode, buttons = 0, { locked = false } = {}) {
  if (mode !== "street" && mode !== "photo") return false;
  if (locked) return true;
  return buttonsToIntent(mode, buttons).look;
}
