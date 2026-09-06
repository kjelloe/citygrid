// The triangle sink the L3 kits build into (slice E5).
//
// Pure: no three, no DOM, no colour. Every hand-rolled piece of geometry in the
// renderer — roofs, walls, reveals, props — pushes into one of these and hands
// back the same `{ position, normal, uv, triangles }` shape `ribbon.js` and the
// baker's merge already speak, which is what keeps all of it inside node's
// reach (ruling 039: the addons are written, not vendored).

/** A growable triangle sink. Sized by pushing rather than by counting: every
 * one of these forms has a different triangle count and an off-by-one in the
 * count is a buffer of zeroes at the end, which draws as a shard through the
 * middle of the building. */
export function sink() {
  // Growable typed arrays, not JS arrays. A chunk of thirty facades is
  // 24,000 triangles and half a million `push` calls, and that alone was
  // 4 ms of a chunk bake against an 8 ms budget (slice E5). Doubling a
  // Float32Array costs a handful of copies and nothing per vertex.
  let position = new Float32Array(768);
  let normal = new Float32Array(768);
  let uv = new Float32Array(512);
  let at = 0;   // vertices written

  function room(vertices) {
    if ((at + vertices) * 3 <= position.length) return;
    let size = position.length;
    while ((at + vertices) * 3 > size) size *= 2;
    const p = new Float32Array(size); p.set(position); position = p;
    const n = new Float32Array(size); n.set(normal); normal = n;
    const u = new Float32Array((size / 3) * 2); u.set(uv); uv = u;
  }

  function write(v, nx, ny, nz) {
    position[at * 3] = v[0];
    position[at * 3 + 1] = v[1];
    position[at * 3 + 2] = v[2];
    normal[at * 3] = nx;
    normal[at * 3 + 1] = ny;
    normal[at * 3 + 2] = nz;
    uv[at * 2] = v[0];
    uv[at * 2 + 1] = v[2];
    at += 1;
  }

  return {
    /** One triangle, wound so its front face points the way the geometry does.
     *
     * Winding is not a property of the normal — E3 shipped a road that was lit
     * correctly and then backface-culled because only the normal was flipped. */
    tri(a, b, c) {
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) return;
      nx /= len; ny /= len; nz /= len;
      room(3);
      write(a, nx, ny, nz);
      write(b, nx, ny, nz);
      write(c, nx, ny, nz);
    },
    quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); },
    /** A box, closed, with outward normals. */
    box(x0, y0, z0, x1, y1, z1) {
      const p = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      this.quad(p[4], p[5], p[6], p[7]);   // top
      this.quad(p[3], p[2], p[1], p[0]);   // bottom
      this.quad(p[0], p[1], p[5], p[4]);   // north
      this.quad(p[2], p[3], p[7], p[6]);   // south
      this.quad(p[1], p[2], p[6], p[5]);   // east
      this.quad(p[3], p[0], p[4], p[7]);   // west
    },
    get triangles() { return at / 3; },
    done() {
      return {
        position: position.subarray(0, at * 3),
        normal: normal.subarray(0, at * 3),
        uv: uv.subarray(0, at * 2),
        triangles: at / 3,
        color: undefined,
      };
    },
  };
}
