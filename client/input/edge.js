// Edge scrolling, and the touch gesture that stands in for it (slice K3, A59).
//
// Kjell: *"edge scrolling when using mouse, on touch devices, pull and drag
// from the border to move."* So it is on for a mouse rather than the opt-in row
// Q82 assumed, and touch gets its own shape of the same idea — a drag that
// STARTS at the border pans, because a finger has no hover and a phone has no
// edge to rest a pointer against.
//
// Pure, and in the input layer, so the geometry can be argued about in node.
// The controller supplies the pointer and the canvas; this says which way and
// how hard.

/** How deep the live band is, as a fraction of the smaller canvas axis.
 *
 * A fraction rather than a pixel count: 24 px is a comfortable band on a
 * laptop and a sliver on a 4K panel, and the control should feel the same on
 * both. Capped in pixels at both ends so it never becomes absurd. */
export const EDGE_FRACTION = 0.04;
export const EDGE_MIN_PX = 12;
export const EDGE_MAX_PX = 64;

/** Seconds to cross the visible span at full lean, matching the cluster's pad
 * (`PAN_SECONDS`) so every way of panning moves at one speed. */
export const EDGE_SECONDS = 4;

/** How wide the live band is on this canvas, in pixels. */
export function edgeBand(width, height) {
  const shorter = Math.min(width, height);
  return Math.max(EDGE_MIN_PX, Math.min(EDGE_MAX_PX, shorter * EDGE_FRACTION));
}

/**
 * Which way the view should move for a pointer at `(px, py)`, and how hard.
 *
 * Returns `{ x, y }` in the range [-1, 1] each, where 1 is the far edge of the
 * band. **Ramped rather than binary**: a pointer one pixel inside the band
 * barely moves and one against the frame moves at full speed, so a player
 * reaching for a control near the edge does not get a lurch.
 *
 * Outside the canvas returns zero. A pointer that has left the window is not
 * asking for anything, and a browser that reports a stale position while the
 * player is in another application must not pan the city for a minute.
 */
export function edgeScroll(px, py, width, height) {
  if (!(width > 0) || !(height > 0)) return { x: 0, y: 0 };
  if (px < 0 || py < 0 || px > width || py > height) return { x: 0, y: 0 };
  const band = edgeBand(width, height);
  const lean = (near, far) => {
    if (near < band) return -(1 - near / band);
    if (far < band) return 1 - far / band;
    return 0;
  };
  return {
    x: lean(px, width - px),
    y: lean(py, height - py),
  };
}

/**
 * Whether a touch drag that began at `(px, py)` is a border pull.
 *
 * The touch half of A59. A drag from the border pans; a drag from anywhere else
 * is whatever it already was, so this cannot steal the one-finger pan or a
 * drag-paint that happens to begin near the frame — it is the START that
 * decides, once, and the answer is remembered for the gesture.
 */
export function isBorderPull(px, py, width, height) {
  if (!(width > 0) || !(height > 0)) return false;
  const band = edgeBand(width, height);
  return px < band || py < band || width - px < band || height - py < band;
}
