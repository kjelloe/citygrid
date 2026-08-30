// Turning a gesture into tiles, and tiles into what crosses the wire.
//
// A drag is reported as a handful of sampled points, not as a continuous line,
// and the wire takes run-length pairs rather than a list of tiles. Both of
// those conversions live here, pure, because both have a failure mode that is
// invisible until much later: a road with holes in it, and a drag that costs
// four hundred commands instead of one.

export function tileIndex(x, y, width) {
  return y * width + x;
}

/** Every tile on the line between two tiles, both ends included.
 *
 * Bresenham, because pointer events are SAMPLED. A fast drag reports tiles five
 * apart, and a road built only from the reported tiles has gaps the player did
 * not ask for and will not notice until the traffic refuses to flow. */
export function lineTiles(x0, y0, x1, y1) {
  const tiles = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    tiles.push({ x, y });
    if (x === x1 && y === y1) return tiles;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x += sx; }
    if (e2 <= dx) { error += dx; y += sy; }
  }
}

/** Every tile in the rectangle spanned by two corners, in any drag direction. */
export function rectTiles(x0, y0, x1, y1) {
  const tiles = [];
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  for (let y = loY; y <= hiY; y += 1) {
    for (let x = loX; x <= hiX; x += 1) tiles.push({ x, y });
  }
  return tiles;
}

/** Tile indices to `[start, length, start, length, …]`.
 *
 * This is the shape `cellsFromRuns` accepts, and it is why a forty-tile road is
 * two numbers on the wire instead of forty commands. Sorting and deduplicating
 * first is not tidiness: a drag wobbles and doubles back constantly, so the
 * same tile arrives many times, and sending it twice charges for it twice. */
export function toRuns(indices) {
  if (indices.length === 0) return [];
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const runs = [];
  let start = sorted[0];
  let length = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === start + length) {
      length += 1;
    } else {
      runs.push(start, length);
      start = sorted[i];
      length = 1;
    }
  }
  runs.push(start, length);
  return runs;
}

/** How many tiles a run list covers — the number the cost preview needs. */
export function runsLength(runs) {
  let total = 0;
  for (let i = 1; i < runs.length; i += 2) total += runs[i];
  return total;
}
