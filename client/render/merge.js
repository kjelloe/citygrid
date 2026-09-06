// Concatenating non-indexed geometry (slice E2; ruling 039, spec §6.4).
//
// The baker's whole need, and the reason ruling 039 says to write the addons
// rather than vendor them: `BufferGeometryUtils` is 700 lines for this.
//
// Pure arithmetic over typed arrays and no three import, so it can be tested in
// node — and the failures worth catching are all arithmetic: a matrix applied
// to positions but not to normals, a colour written per geometry rather than
// per vertex, a `uv` present on some inputs and not others.
//
// Matrices are column-major `Float32Array(16)`, which is how three stores them.

/** Applies a 4×4 to a point. */
function transformPoint(m, x, y, z, out, at) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out[at] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[at + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[at + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
}

/** Applies a 4×4 to a DIRECTION — the upper 3×3 only, then renormalised.
 *
 * Putting a normal through the full matrix picks up the translation, and then
 * every face is lit as though it pointed at the origin. It does not look
 * broken; it looks slightly wrong everywhere, which is worse. */
function transformNormal(m, x, y, z, out, at) {
  const nx = m[0] * x + m[4] * y + m[8] * z;
  const ny = m[1] * x + m[5] * y + m[9] * z;
  const nz = m[2] * x + m[6] * y + m[10] * z;
  const len = Math.hypot(nx, ny, nz) || 1;
  out[at] = nx / len;
  out[at + 1] = ny / len;
  out[at + 2] = nz / len;
}

/**
 * Merges `parts` — each `{ position, normal, color?, uv?, matrix }` over
 * non-indexed triangles — into one set of buffers.
 *
 * `uv` survives only when EVERY part has one: half a uv buffer is worse than
 * none, because the vertices without one read whatever was in the array and a
 * texture smears across the wall.
 */
export function mergeNonIndexed(parts) {
  let vertices = 0;
  let everyUv = parts.length > 0;
  for (const part of parts) {
    vertices += part.position.length / 3;
    if (!part.uv) everyUv = false;
  }

  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const color = new Float32Array(vertices * 3);
  const uv = everyUv ? new Float32Array(vertices * 2) : undefined;

  let at = 0;
  let uvAt = 0;
  for (const part of parts) {
    const m = part.matrix;
    const count = part.position.length / 3;
    for (let i = 0; i < count; i += 1) {
      const p = i * 3;
      transformPoint(m, part.position[p], part.position[p + 1], part.position[p + 2], position, at + p);
      if (part.normal) {
        transformNormal(m, part.normal[p], part.normal[p + 1], part.normal[p + 2], normal, at + p);
      } else {
        normal[at + p + 1] = 1;
      }
      // White rather than zero when a geometry has no colour of its own: zeros
      // are black, and a material that multiplies by vertex colour would render
      // the whole bucket invisible.
      color[at + p] = part.color ? part.color[p] : 1;
      color[at + p + 1] = part.color ? part.color[p + 1] : 1;
      color[at + p + 2] = part.color ? part.color[p + 2] : 1;
    }
    if (uv) {
      uv.set(part.uv, uvAt);
      uvAt += count * 2;
    }
    at += count * 3;
  }

  return { position, normal, color, uv, triangles: vertices / 3 };
}
