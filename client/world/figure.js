// The person seen from the air (slice B7, P61).
//
// E7's person is three boxes, 36 triangles, and resolvable at 50 px a tile —
// a zoom the city camera reaches only on a big screen. From the air a crowd
// needs a figure a third of the price that still reads as a PERSON rather than
// a dot: a three-sided body tapering to the shoulders and a pointed head.
// Faceted, never a billboard: a billboard turns to follow the camera, and from
// an orbiting city camera that is the one motion a viewer notices.
//
// Pure and in `client/world/` so node can check what `building-kit.js` then
// hands to three: the count, the size, and that every face points OUT — a
// figure with one face wound inwards is culled on that side and reads as a
// flicker at exactly the zoom it exists for.

/** Tile units. A tile is 20 m, so 0.09 is 1.8 m. */
const BODY = { radius: 0.016, shoulder: 0.013, top: 0.068 };
const HEAD = { radius: 0.010, base: 0.070, top: 0.092 };
const TORSO = 1;
const FACE = 0.8;

export const CITY_FIGURE_TRIANGLES = 12;

/** Three points round the vertical axis, one of them facing +z (the way the
 * figure walks is +x; a point to the front would read as a wedge). */
function ring(radius, y) {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    out.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return out;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Winds a triangle so its right-handed normal points away from `centre`. */
function outward(tri, centre) {
  const [a, b, c] = tri;
  const n = cross(sub(b, a), sub(c, a));
  const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  return dot(n, sub(mid, centre)) >= 0 ? [a, b, c] : [a, c, b];
}

function solid(tris, shade) {
  const pts = tris.flat();
  const centre = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  return tris.map((t) => ({ tri: outward(t, centre), shade }));
}

/** Twelve triangles: a tapered three-sided body with a floor and a lid (8),
 * and a three-sided pointed head with a base (4). */
export function cityFigure() {
  const foot = ring(BODY.radius, 0);
  const shoulder = ring(BODY.shoulder, BODY.top);
  const body = [];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    body.push([foot[i], foot[j], shoulder[j]], [foot[i], shoulder[j], shoulder[i]]);
  }
  body.push([shoulder[0], shoulder[1], shoulder[2]], [foot[0], foot[1], foot[2]]);

  const neck = ring(HEAD.radius, HEAD.base);
  const crown = [0, HEAD.top, 0];
  const head = [];
  for (let i = 0; i < 3; i += 1) head.push([neck[i], neck[(i + 1) % 3], crown]);
  head.push([neck[0], neck[1], neck[2]]);

  return [...solid(body, TORSO), ...solid(head, FACE)];
}
