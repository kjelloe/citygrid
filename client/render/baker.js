// The baker (slice E2; spec §6.4, ruling 039).
//
// One per 16×16 chunk, never per world. Geometry goes in with a matrix and a
// colour; what comes out is a `Group` holding one mesh per shading signature —
// so a whole street block is a handful of draw calls and one cull unit and one
// shadow caster, instead of a thousand of each.
//
// Everything is baked into vertex colours, which is what lets a hundred
// differently coloured walls share one material (ruling 022: flat colour and
// baked face shading, no atlas). A piece that needs a texture cannot come
// through here — E5's signage merges by material afterwards instead.

import * as THREE from "three";
import { mergeNonIndexed } from "./merge.js";
import { makeMaterial } from "./style-assets.js";

/** The shading signature: two pieces share a mesh only if all of it matches.
 * `transparent` and `emissive` are the ones that matter — a transparent piece
 * in an opaque bucket is depth-sorted wrongly, and an emissive one in a plain
 * bucket cannot be dialled up at night (spec §6.5). */
function signature(options) {
  return [
    options.transparent ? "t" : "o",
    options.emissive ? `e${options.emissive.toString(16)}` : "-",
    options.side ?? "front",
    options.bands ?? "-",
  ].join(":");
}

export function createBaker(styleName = "plain") {
  /** signature → { options, parts: [] } */
  const buckets = new Map();
  let triangles = 0;

  /** Pulls the attribute arrays out of a three geometry. Non-indexed only: the
   * merge concatenates, and an index buffer would have to be renumbered. */
  function partOf(geometry, matrix, colour) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const count = position.count;
    const rgb = new THREE.Color(colour);
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      color[i * 3] = rgb.r;
      color[i * 3 + 1] = rgb.g;
      color[i * 3 + 2] = rgb.b;
    }
    return {
      position: position.array,
      normal: normal ? normal.array : undefined,
      color,
      uv: uv ? uv.array : undefined,
      matrix: matrix.elements,
    };
  }

  return {
    /** Adds one piece. `geometry` must be non-indexed; `matrix` is a
     * `THREE.Matrix4`; `colour` is written into every vertex. */
    add(geometry, matrix, colour, options = {}) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      const key = signature(options);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { options, parts: [] }; buckets.set(key, bucket); }
      bucket.parts.push(partOf(source, matrix, colour));
      triangles += source.getAttribute("position").count / 3;
      if (source !== geometry) source.dispose();
    },

    get triangles() { return triangles; },
    get buckets() { return buckets.size; },

    /** Merges each bucket and returns the group. One mesh per signature. */
    build() {
      const group = new THREE.Group();
      for (const [key, bucket] of buckets) {
        const merged = mergeNonIndexed(bucket.parts);
        if (merged.triangles === 0) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(merged.position, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(merged.normal, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(merged.color, 3));
        if (merged.uv) geometry.setAttribute("uv", new THREE.BufferAttribute(merged.uv, 2));
        geometry.computeBoundingSphere();

        // The style decides the material; the signature only decides which
        // pieces share one (spec §7.1 — nothing else in the renderer knows what
        // shading it got).
        const material = makeMaterial(styleName, 0xffffff);
        material.transparent = Boolean(bucket.options.transparent);
        if (bucket.options.transparent) material.opacity = bucket.options.opacity ?? 0.6;
        if (bucket.options.side === "double") material.side = THREE.DoubleSide;
        if (bucket.options.emissive !== undefined && material.emissive) {
          material.emissive = new THREE.Color(bucket.options.emissive);
          material.emissiveIntensity = 0;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = key;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      return group;
    },

    /** Frees a built group. A cache that rebuilds a chunk and forgets the old
     * geometry leaks a megabyte a time on a map anyone pans across. */
    dispose(group) {
      if (!group) return;
      for (const child of group.children) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
      group.clear();
    },
  };
}
