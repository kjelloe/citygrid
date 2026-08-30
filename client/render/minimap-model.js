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

/** Whether a rectangle is worth drawing at all. Zoomed all the way out on a
 * small region the box covers everything, and a border around the whole
 * minimap is noise rather than information. */
export function rectIsInformative(rect, size) {
  return rect.width < size * 0.98 || rect.height < size * 0.98;
}
