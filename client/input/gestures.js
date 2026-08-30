// The gesture state machine: pointer events in, intents out.
//
// One code path for mouse, pen and touch, because the browser already gives us
// one — pointer events. The machine never touches the camera, the renderer or
// the engine; it says what the player meant and something else decides what to
// do about it. That is what makes it testable without a browser, which matters
// because every genuinely hard bug in input is in here rather than in the
// listeners:
//
//   - a tap that registers as a drag, so tapping the map pans it a pixel
//   - a pinch that also pans, so zooming slides the city away
//   - lifting one finger of two, and the map leaping by half the pinch width
//   - a twist that rotates every frame instead of once
//   - a stroke left open by a pointer the browser took away
//
// Intents:
//   {type:"panBy", dx, dy}      screen pixels, already sign-corrected
//   {type:"zoomBy", factor}     >1 zooms in
//   {type:"rotate", direction}  +1 or -1, one quarter turn (ruling 006)
//   {type:"paintStart", x, y}   screen pixels; the caller picks the tile
//   {type:"paintTo", x, y}
//   {type:"paintEnd"}
//   {type:"tap", x, y}
//   {type:"hover", x, y}

const DEFAULTS = {
  /** How far a pointer must move before it is a drag and not a press. A hand
   * resting on a phone moves a pixel or two, and panning on that makes the map
   * feel like it is sliding away. */
  slop: 6,
  /** How far a two-finger twist must turn before it counts as one quarter
   * turn. The camera has four snapped angles, so a twist is a discrete event;
   * emitting one per frame would spin the world. */
  twist: Math.PI / 4,
  /** Whether a build tool is selected. One finger paints when it is and pans
   * when it is not; two fingers are always the camera. */
  building: () => false,
};

export function createGestures(options = {}) {
  return {
    options: { ...DEFAULTS, ...options },
    pointers: new Map(),
    painting: false,
    panning: false,
    moved: false,
    /** Where the pan is measured from. Set when the slop is broken and reset
     * whenever the pointer set changes, which is what stops the map jumping
     * when one of two fingers lifts. */
    anchor: undefined,
    pinch: undefined,
    twisted: 0,
  };
}

function centroid(pointers) {
  let x = 0;
  let y = 0;
  for (const p of pointers.values()) { x += p.x; y += p.y; }
  return { x: x / pointers.size, y: y / pointers.size };
}

function spread(pointers) {
  const [a, b] = [...pointers.values()];
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function endStroke(g, out) {
  if (g.painting) {
    g.painting = false;
    out.push({ type: "paintEnd" });
  }
}

export function down(g, p) {
  const out = [];
  g.pointers.set(p.id, { x: p.x, y: p.y });

  if (g.pointers.size === 1) {
    g.moved = false;
    g.panning = false;
    g.press = { x: p.x, y: p.y };
    g.anchor = { x: p.x, y: p.y };
    if (g.options.building()) {
      g.painting = true;
      out.push({ type: "paintStart", x: p.x, y: p.y });
    }
    return out;
  }

  // A second finger means the camera, whatever the first one was doing. Ending
  // the stroke here is what stops a pinch leaving a stray road behind it.
  endStroke(g, out);
  g.panning = false;
  if (g.pointers.size === 2) {
    g.pinch = spread(g.pointers);
    g.twisted = 0;
    g.anchor = centroid(g.pointers);
  }
  return out;
}

export function move(g, p) {
  const out = [];
  if (!g.pointers.has(p.id)) {
    // A pointer we never saw pressed: a hover. Useful for the ghost preview.
    return [{ type: "hover", x: p.x, y: p.y }];
  }
  const previous = g.pointers.get(p.id);
  g.pointers.set(p.id, { x: p.x, y: p.y });

  if (g.pointers.size >= 2) {
    if (g.pointers.size === 2) {
      const now = spread(g.pointers);
      if (g.pinch && g.pinch.distance > 0) {
        const factor = now.distance / g.pinch.distance;
        if (Math.abs(factor - 1) > 0.01) out.push({ type: "zoomBy", factor });
      }
      // Twist accumulates and fires in whole steps.
      if (g.pinch) {
        let delta = now.angle - g.pinch.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        g.twisted += delta;
        while (Math.abs(g.twisted) >= g.options.twist) {
          const direction = g.twisted > 0 ? 1 : -1;
          out.push({ type: "rotate", direction });
          g.twisted -= direction * g.options.twist;
        }
      }
      g.pinch = now;
    }
    const middle = centroid(g.pointers);
    if (g.anchor) {
      const dx = middle.x - g.anchor.x;
      const dy = middle.y - g.anchor.y;
      if (dx !== 0 || dy !== 0) out.push({ type: "panBy", dx, dy });
    }
    g.anchor = middle;
    return out;
  }

  if (g.painting) {
    out.push({ type: "paintTo", x: p.x, y: p.y });
    g.moved = true;
    return out;
  }

  // One pointer, no build tool: pan, but only once the slop is broken.
  //
  // The slop is measured from the PRESS, and the first pan delta from the
  // pointer's PREVIOUS position. Those have to be two different points. Measure
  // the delta from the press instead and the map jumps by the whole slop
  // distance on the frame it breaks; anchor on the current position instead and
  // the pan lags a frame behind the finger.
  const press = g.press ?? { x: p.x, y: p.y };
  if (!g.panning) {
    if (Math.hypot(p.x - press.x, p.y - press.y) < g.options.slop) return out;
    g.panning = true;
    g.moved = true;
    g.anchor = { x: previous.x, y: previous.y };
  }
  const dx = p.x - g.anchor.x;
  const dy = p.y - g.anchor.y;
  g.anchor = { x: p.x, y: p.y };
  if (dx !== 0 || dy !== 0) out.push({ type: "panBy", dx, dy });
  return out;
}

export function up(g, p) {
  const out = [];
  if (!g.pointers.has(p.id)) return out;
  g.pointers.delete(p.id);

  if (g.pointers.size === 0) {
    endStroke(g, out);
    if (!g.moved && !g.options.building()) out.push({ type: "tap", x: p.x, y: p.y });
    g.panning = false;
    g.press = undefined;
    g.anchor = undefined;
    g.pinch = undefined;
    return out;
  }

  // Fingers remain. Re-anchor on what is still down, or the next move is
  // measured against a centroid that no longer exists and the map leaps.
  g.anchor = centroid(g.pointers);
  g.press = { ...g.anchor };
  g.pinch = g.pointers.size === 2 ? spread(g.pointers) : undefined;
  g.twisted = 0;
  g.panning = false;
  return out;
}

/** The browser took the pointer away — a system gesture, a lost capture. End
 * cleanly rather than leaving a stroke open forever. */
export function cancel(g) {
  const out = [];
  endStroke(g, out);
  g.pointers.clear();
  g.panning = false;
  g.press = undefined;
  g.anchor = undefined;
  g.pinch = undefined;
  g.twisted = 0;
  return out;
}
