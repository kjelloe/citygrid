// Draped ribbons (slice E3; spec §5.2, ruling 039).
//
// A carriageway, a kerb face, a sidewalk and a sagging wire are one primitive:
// a quad strip along a polyline with every vertex sampled from the height
// field. Union Square calls it `strip`, Higashiyama calls it `ribbon`, and
// ruling 039 says the addons are written rather than vendored.
//
// Pure arithmetic over arrays, returning the same `{ position, normal, color,
// uv, triangles }` shape the baker's merge consumes — so it stays on the node
// side of the line three draws through this renderer, and what it has to get
// right is testable: vertices ON the ground rather than through it, a camber
// that leans the right way, and a corner that keeps its width.

/** Unit normal to the left of a forward vector, in the ground plane. */
function sideOf(fx, fz) {
  const len = Math.hypot(fx, fz) || 1;
  return { x: -fz / len, z: fx / len };
}

/**
 * Per-point offset directions, mitred.
 *
 * Offsetting each point along its own segment's normal pinches the inside of a
 * turn to nothing; averaging the two adjacent segment normals does not, and a
 * pinched kerb is exactly what you notice standing on the pavement.
 */
function offsets(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    out.push(sideOf(b.x - a.x, b.z - a.z));
  }
  return out;
}

/** Cumulative length along the polyline, in metres — the ribbon's `u`. */
function arcLengths(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  return cum;
}

/**
 * Writes a triangle, wound so its FRONT face points the way it should.
 *
 * The first version flipped the normal vector when it came out pointing down
 * and left the vertex order alone. A normal is what the shader lights with; the
 * winding is what the rasteriser culls with — so the road was lit correctly and
 * then thrown away, and which ribbons survived depended on which way their
 * corridor happened to run. Poles are boxes and drew fine, which is what made
 * it look like a colour problem for an hour.
 */
function triangle(buf, at, p, q, r, want) {
  const ux = q.x - p.x; const uy = q.y - p.y; const uz = q.z - p.z;
  const vx = r.x - p.x; const vy = r.y - p.y; const vz = r.z - p.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const order = nx * want.x + ny * want.y + nz * want.z < 0 ? [p, r, q] : [p, q, r];
  if (order[1] === r) { nx = -nx; ny = -ny; nz = -nz; }
  for (const c of order) {
    emit(buf, at, c.x, c.y, c.z, nx, ny, nz, c.u, c.v);
    at += 1;
  }
  return at;
}

/** Writes one triangle's worth of a vertex into the buffers. */
function emit(buf, at, x, yy, z, nx, ny, nz, u, v) {
  buf.position[at * 3] = x;
  buf.position[at * 3 + 1] = yy;
  buf.position[at * 3 + 2] = z;
  buf.normal[at * 3] = nx;
  buf.normal[at * 3 + 1] = ny;
  buf.normal[at * 3 + 2] = nz;
  buf.uv[at * 2] = u;
  buf.uv[at * 2 + 1] = v;
}

function allocate(triangles) {
  const vertices = triangles * 3;
  return {
    position: new Float32Array(vertices * 3),
    normal: new Float32Array(vertices * 3),
    uv: new Float32Array(vertices * 2),
    triangles,
  };
}

/**
 * A flat strip along `points`, `halfWidth` metres each side, draped on
 * `heightAt` and lifted by `lift`.
 *
 * `camber` drops the two edges below the centre line, which is how a road is
 * crowned so water runs off it — and, at this scale, the thing that stops a
 * wide carriageway reading as a flat sheet of grey.
 */
export function ribbon(points, halfWidth, heightAt, options = {}) {
  const lift = options.lift ?? 0;
  const camber = options.camber ?? 0;
  if (!points || points.length < 2) return allocate(0);

  const side = offsets(points);
  const cum = arcLengths(points);
  const spans = points.length - 1;

  // A crown needs a MIDDLE row. A strip is two columns of vertices — both of
  // them edges — so "lower the edges" applied to it lowers the whole ribbon;
  // the first version dropped the road bodily and looked identical. With a
  // camber the strip is three columns and four triangles a span, which is what
  // a crown costs and is why it is off by default.
  const columns = camber > 0 ? [-1, 0, 1] : [-1, 1];
  const buf = allocate(spans * (columns.length - 1) * 2);

  let at = 0;
  // Up, always: a strip wound the other way round is backface-culled, and a
  // road that is invisible from above is the one bug nobody would guess at.
  const UP = { x: 0, y: 1, z: 0 };
  const face = (p, q, r) => { at = triangle(buf, at, p, q, r, UP); };

  // `heights` overrides the field: a wire's y comes from its own sag curve, not
  // from the ground under it. Given per point, so the caller does not have to
  // reason about how many times the ribbon samples each one.
  const heights = options.heights;
  // Every corner ONCE. Sampling it inside the span loop asked the height field
  // for the same point four times, and `heightAt` is a search over the
  // corridors near it — nine chunks of street took 9 ms a bake against an 8 ms
  // frame budget, and nearly all of it was this (slice E3).
  const grid = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const s = side[i];
    const row = [];
    for (const column of columns) {
      const x = p.x + s.x * halfWidth * column;
      const z = p.z + s.z * halfWidth * column;
      // The crown is a parabola across the width: full lift at the centre, down
      // by `camber` at either edge.
      const drop = camber * column * column;
      const base = heights ? heights[i] : heightAt(x, z);
      row.push({ x, z, y: base + lift - drop, u: cum[i], v: (column + 1) / 2 });
    }
    grid.push(row);
  }

  for (let i = 0; i < spans; i += 1) {
    for (let c = 0; c < columns.length - 1; c += 1) {
      const al = grid[i][c];
      const ar = grid[i][c + 1];
      const bl = grid[i + 1][c];
      const br = grid[i + 1][c + 1];
      face(al, bl, ar);
      face(ar, bl, br);
    }
  }
  return { ...buf, color: undefined };
}

/**
 * A vertical face hanging `drop` metres below the ribbon's two edges — the kerb.
 *
 * What turns a 0.15 m step into something visible from the pavement rather than
 * a colour change, and what the walker's `floorAt` will step up in E4.
 */
export function skirt(points, halfWidth, heightAt, drop, options = {}) {
  const lift = options.lift ?? 0;
  const heights = options.heights;
  if (!points || points.length < 2) return allocate(0);
  const side = offsets(points);
  const cum = arcLengths(points);
  const spans = points.length - 1;
  const buf = allocate(spans * 4);

  // Both edges of every point once, for the same reason `ribbon` does it.
  const edges = [-1, 1].map((edge) => points.map((p, k) => {
    const s = side[k];
    const x = p.x + s.x * halfWidth * edge;
    const z = p.z + s.z * halfWidth * edge;
    return { x, z, top: (heights ? heights[k] : heightAt(x, z)) + lift, u: cum[k] };
  }));

  let at = 0;
  for (let i = 0; i < spans; i += 1) {
    for (let e = 0; e < 2; e += 1) {
      const edge = e === 0 ? -1 : 1;
      const nx = side[i].x * edge;
      const nz = side[i].z * edge;
      const a = edges[e][i];
      const b = edges[e][i + 1];
      // Outward, away from the carriageway — a kerb seen from the pavement.
      const want = { x: nx, y: 0, z: nz };
      const at1 = { ...a, y: a.top, v: 1 };
      const at0 = { ...a, y: a.top - drop, v: 0 };
      const bt1 = { ...b, y: b.top, v: 1 };
      const bt0 = { ...b, y: b.top - drop, v: 0 };
      at = triangle(buf, at, at1, at0, bt1, want);
      at = triangle(buf, at, bt1, at0, bt0, want);
    }
  }
  return { ...buf, color: undefined };
}

/**
 * A wire between two poles, sagging by `sag` metres at its middle.
 *
 * A parabola rather than a catenary: over a 60 m span they differ by
 * centimetres, and eight segments of parabola is the single thing that most
 * makes a suburb read as a suburb from eye height (spec §5.4).
 */
export function sagCurve(a, b, sag, segments = 8) {
  const out = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
      z: a.z + (b.z - a.z) * t,
    });
  }
  return out;
}

/**
 * Splits a polyline into dashes of `dashM` metres separated by `gapM`.
 *
 * Each dash comes back as its own polyline, and it keeps every vertex of the
 * source it spans — so a dash that straddles a bend bends with it rather than
 * cutting the corner, which is the whole reason the centre line is built from
 * the corridor and not from the tile grid.
 */
export function dashes(points, dashM, gapM) {
  if (!points || points.length < 2) return [];
  const cum = arcLengths(points);
  const total = cum[cum.length - 1];
  const at = (distance) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < distance) i += 1;
    const span = cum[i] - cum[i - 1] || 1;
    const t = (distance - cum[i - 1]) / span;
    return {
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
    };
  };
  const out = [];
  for (let start = 0; start + dashM <= total; start += dashM + gapM) {
    const end = start + dashM;
    const run = [at(start)];
    for (let i = 0; i < cum.length; i += 1) {
      if (cum[i] > start && cum[i] < end) run.push(points[i]);
    }
    run.push(at(end));
    out.push(run);
  }
  return out;
}

/**
 * The parts of a polyline that lie inside `box`, each with one point kept
 * beyond either end so a ribbon still reaches the boundary.
 *
 * A corridor is a whole street and a chunk is 320 m of city, so building every
 * corridor that so much as touches a chunk built most of the city into most of
 * its chunks: nine chunks held 50,688 triangles and took 12 ms each to bake,
 * against an 8 ms frame budget (slice E3). Overlap at the seam is deliberate —
 * a corridor clipped exactly at the boundary leaves a hairline of ground
 * showing between two chunks.
 */
export function clip(points, box) {
  if (!points || points.length < 2) return [];
  const inside = (p) => p.x >= box.x0 && p.x <= box.x1 && p.z >= box.z0 && p.z <= box.z1;
  const out = [];
  let run = null;
  for (let i = 0; i < points.length; i += 1) {
    const here = inside(points[i]);
    const next = i + 1 < points.length && inside(points[i + 1]);
    if (here || next) {
      if (!run) {
        run = [];
        // The point before the first one inside, so the ribbon crosses the edge.
        if (i > 0 && !here) run.push(points[i - 1]);
        else if (i > 0 && !inside(points[i - 1])) run.push(points[i - 1]);
      }
      run.push(points[i]);
      continue;
    }
    if (run) { run.push(points[i]); if (run.length >= 2) out.push(run); run = null; }
  }
  if (run && run.length >= 2) out.push(run);
  return out;
}

/**
 * A polyline with `metres` cut off each end.
 *
 * The carriageway runs through a junction — that is what a junction is — but a
 * pavement and a centre line must not: drawn along the whole corridor they
 * paint a kerb straight across the mouth of the side street, which is the first
 * thing anyone notices in a screenshot of a crossroads (slice E3).
 */
export function trim(points, metres) {
  if (!points || points.length < 2 || metres <= 0) return points ?? [];
  const cum = arcLengths(points);
  const total = cum[cum.length - 1];
  if (total <= metres * 2) return [];
  const at = (distance) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < distance) i += 1;
    const span = cum[i] - cum[i - 1] || 1;
    const t = (distance - cum[i - 1]) / span;
    return {
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
    };
  };
  const out = [at(metres)];
  for (let i = 0; i < points.length; i += 1) {
    if (cum[i] > metres && cum[i] < total - metres) out.push(points[i]);
  }
  out.push(at(total - metres));
  return out;
}
