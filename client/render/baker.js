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
import { signature } from "./streaming.js";

export function createBaker(styleName = "plain") {
  /** signature → { options, parts: [] } */
  const buckets = new Map();
  const extras = [];
  /** Where this chunk's lamps hang. Geometry alone cannot answer "which eight
   * lamps are nearest the player", and the night rig has to (spec §7.3). */
  const lamps = [];
  let triangles = 0;

  const IDENTITY = new THREE.Matrix4();

  /** Fills a vertex colour array. */
  function colourFor(count, colour) {
    const rgb = new THREE.Color(colour);
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      color[i * 3] = rgb.r;
      color[i * 3 + 1] = rgb.g;
      color[i * 3 + 2] = rgb.b;
    }
    return color;
  }

  /** Pulls the attribute arrays out of a three geometry. Non-indexed only: the
   * merge concatenates, and an index buffer would have to be renumbered. */
  function partOf(geometry, matrix, colour) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    return {
      position: position.array,
      normal: normal ? normal.array : undefined,
      color: colourFor(position.count, colour),
      uv: uv ? uv.array : undefined,
      matrix: matrix.elements,
    };
  }

  function bucketFor(options) {
    const key = signature(options);
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { options, parts: [] }; buckets.set(key, bucket); }
    return bucket;
  }

  return {
    /** Adds one piece. `geometry` must be non-indexed; `matrix` is a
     * `THREE.Matrix4`; `colour` is written into every vertex. */
    add(geometry, matrix, colour, options = {}) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      bucketFor(options).parts.push(partOf(source, matrix, colour));
      triangles += source.getAttribute("position").count / 3;
      if (source !== geometry) source.dispose();
    },

    /** The same, from the raw buffers the hand-rolled kits produce.
     *
     * Wrapping every one of them in a `BufferGeometry` first was what the
     * facades did at first, and a chunk of thirty buildings is two hundred
     * geometries allocated and thrown away to hand over arrays the baker was
     * about to read anyway — 18 ms a bake against an 8 ms budget (slice E5). */
    addPart(part, colour, options = {}) {
      if (!part || part.triangles === 0) return;
      bucketFor(options).parts.push({
        position: part.position,
        normal: part.normal,
        color: colourFor(part.position.length / 3, colour),
        uv: part.uv,
        matrix: IDENTITY.elements,
      });
      triangles += part.triangles;
    },

    /** Meshes that cannot be merged into a vertex-colour bucket — a fascia
     * carries a texture, and a textured mesh has its own material. They ride in
     * the same group so a chunk is still one cull unit. */
    extra(meshes) {
      for (const mesh of meshes) {
        extras.push(mesh);
        triangles += mesh.geometry.getAttribute("position").count / 3;
      }
    },

    lamps,

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
          // Marked, so the night rig can find its own buckets without asking
          // whether a black emissive colour means "unlit" or "not emissive".
          material.userData.emissive = true;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = key;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      for (const mesh of extras) {
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
