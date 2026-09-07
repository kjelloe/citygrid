// The minimap's arithmetic (slice 4.1, gamedesign.md §13.3).
//
// Pure: tiles to minimap pixels and back, and the rectangle the camera is
// looking at. Separated from the drawing because these are the parts that are
// wrong by one, or inverted, or off by half a tile — and none of that is
// visible in a 160-pixel picture until you click it and the camera jumps
// somewhere else.
//
// The minimap is square and the region is square, so one scale serves both
// axes. A non-square region would need two, which is why `scaleFor` returns a
// number rather than being inlined.

import { visibleBounds } from "./lod.js";

export function scaleFor(size, width, height) {
  return size / Math.max(width, height);
}

/** Where a tile lands on the minimap. */
export function tileToPixel(x, y, size, width, height) {
  const scale = scaleFor(size, width, height);
  return { x: x * scale, y: y * scale };
}

/** Which tile a click landed on, clamped into the map.
 *
 * Clamped rather than refused: a click one pixel outside a 160-pixel square is
 * a click on the edge of the map, and refusing it makes the corners of the
 * minimap dead.
 */
export function pixelToTile(px, py, size, width, height) {
  const scale = scaleFor(size, width, height);
  const x = Math.floor(px / scale);
  const y = Math.floor(py / scale);
  return {
    x: Math.max(0, Math.min(width - 1, x)),
    y: Math.max(0, Math.min(height - 1, y)),
  };
}

/**
 * The box the camera can see, in minimap pixels.
 *
 * `view.span` is how many tiles fit down the canvas height, so the visible
 * width is `span * aspect`. The rectangle is centred on the camera target and
 * is deliberately NOT clamped to the map: when the player pans to a corner the
 * box should hang over the edge, because that is what the camera is doing.
 */
export function viewportRect(view, aspect, size, width, height) {
  const scale = scaleFor(size, width, height);
  const tallTiles = view.span;
  const wideTiles = view.span * aspect;
  return {
    x: (view.targetX - wideTiles / 2) * scale,
    y: (view.targetZ - tallTiles / 2) * scale,
    width: wideTiles * scale,
    height: tallTiles * scale,
  };
}

/**
 * What the camera can actually see, in minimap pixels.
 *
 * `viewportRect` is a rectangle centred on the target with the span for its
 * height, which is exactly what an ORTHOGRAPHIC camera sees and nothing like
 * what a perspective one does: a frustum at a low pitch is a wedge that opens
 * out towards the horizon, and the box round it holds several times the ground
 * the player can see. The wedge is `visibleBounds`'s own `footprint` — the four
 * corner rays intersected with the ground — which the budget has been using
 * since V5 and the minimap had never asked for.
 *
 * `{ kind: 'none' }` when the view covers the whole map: a border round the
 * whole minimap is noise rather than information.
 */
export function viewportShape(view, aspect, size, width, height) {
  const scale = scaleFor(size, width, height);
  if (view.mode === "ortho" || !view.persp) {
    const rect = viewportRect(view, aspect, size, width, height);
    return rectIsInformative(rect, size) ? { kind: "rect", rect, points: cornersOf(rect) } : { kind: "none" };
  }
  // From `visibleBounds` itself, so the minimap and the budget agree about
  // what the camera can see rather than each having their own idea.
  const footprint = visibleBounds(view, aspect, 0).footprint;
  if (!footprint || footprint.length < 3) {
    const rect = viewportRect(view, aspect, size, width, height);
    return rectIsInformative(rect, size) ? { kind: "rect", rect, points: cornersOf(rect) } : { kind: "none" };
  }
  // Always drawn, unlike the rectangle. A box that covers the whole minimap is
  // noise — it says only "you can see everything" — but a WEDGE that covers it
  // still says which way the camera is pointing, which is the one thing the
  // minimap cannot otherwise tell you under perspective.
  return { kind: "polygon", points: footprint.map((p) => ({ x: p.x * scale, y: p.z * scale })) };
}

function cornersOf(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

/**
 * Where the walker is, in minimap pixels, or `undefined` when they are not in
 * the street.
 *
 * The minimap has never known the walker exists. In street mode the viewport
 * box is drawn from `targetX/Z`, which IS the walker — but a forty-tile box
 * round a person on a pavement says nothing, and a dot says the one thing that
 * matters (V8).
 */
export function walkerMark(view, size, width, height) {
  if (view.mode !== "street") return undefined;
  const scale = scaleFor(size, width, height);
  const at = view.eye ?? { x: view.targetX, z: view.targetZ };
  return { x: at.x * scale, y: at.z * scale, yaw: view.yaw ?? 0 };
}

/** Whether a rectangle is worth drawing at all. Zoomed all the way out on a
 * small region the box covers everything, and a border around the whole
 * minimap is noise rather than information. */
export function rectIsInformative(rect, size) {
  return rect.width < size * 0.98 || rect.height < size * 0.98;
}
