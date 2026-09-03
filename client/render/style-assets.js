// Per-style geometry, materials and palette.
//
// The first attempt at the three probe candidates was one set of boxes with a
// different screen filter over each, and it was rightly called out: all three
// looked like the same low-poly city. A post-process is a finish, not a style.
//
// A style here therefore owns four things, and each of them has to differ:
//   - geometry:  what a building is actually shaped like
//   - shading:   lit, or baked into the vertices
//   - palette:   the colours the world is made from
//   - finish:    the post-process, which is the least of the four

import * as THREE from "three";
import { PALETTES } from "./palettes.js";
import { faceContrastFor, lightingFor } from "./style-light.js";

export { PALETTES, faceContrastFor, lightingFor };


// --- geometry ---------------------------------------------------------------

/** Paints a box's faces in the vertex colours a style wants.
 *
 * `top` and `side` are multipliers on the instance colour. Baking the shading
 * into the vertices is what lets the pixel style use an unlit material and
 * still read as three-dimensional — which is exactly how isometric pixel art
 * has always done it. */
function tintFaces(indexedGeometry, { top, north, east, band }) {
  // Non-indexed first, for two reasons. An indexed box SHARES its corner
  // vertices between faces, so per-face colours blend into gradients instead
  // of staying flat — which quietly weakened the shading everywhere. And the
  // merge below copies attributes without an index buffer, so an indexed input
  // came out as a cloud of shredded triangles.
  const geometry = indexedGeometry.index ? indexedGeometry.toNonIndexed() : indexedGeometry;
  if (geometry !== indexedGeometry) indexedGeometry.dispose();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colours = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const ny = normal.getY(i);
    const nx = normal.getX(i);
    const y = position.getY(i);

    let shade = north;
    if (ny > 0.5) shade = top;
    else if (ny < -0.5) shade = north * 0.6;
    else if (Math.abs(nx) > 0.5) shade = east;

    // A window band: a darker stripe around the middle of the walls. It is
    // what a drawn texture would give, expressed as geometry and vertex
    // colour so it costs nothing per building.
    if (band !== undefined && ny > -0.5 && ny < 0.5 && y > 0.28 && y < 0.72) shade *= band;

    colours[i * 3] = shade;
    colours[i * 3 + 1] = shade;
    colours[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** A single upward-facing quad. Roads, markings and pipes are only ever seen
 * from above, so six faces is five wasted: two triangles instead of twelve.
 * On a 128x128 region with several thousand road tiles that difference is the
 * whole triangle budget. */
export function flatGeometry(styleName, w, d, y = 0) {
  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const colours = new Float32Array(geometry.getAttribute("position").count * 3).fill(1);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** A ground layer with a skirt: a flat top face at `top`, and sides hanging
 * `skirt` below it.
 *
 * Roads, wires and pipes are drawn flat at their own tile's height, while the
 * terrain under them is one continuous surface whose corners are the AVERAGE
 * of the four tiles meeting there. Two neighbouring road tiles two elevation
 * levels apart therefore leave a vertical step with nothing in it, and a
 * camera at 35° looks straight through it into the grass — "the small green
 * grass space between them" (P33). The skirt fills the step, and being hidden
 * under the neighbour it costs nothing to look at.
 *
 * Ten triangles instead of two, but only for the tiles actually on screen. */
export function paveGeometry(styleName, w, d, top, skirt) {
  const box = new THREE.BoxGeometry(w, skirt, d);
  box.translate(0, top - skirt / 2, 0);
  const c = faceContrastFor(styleName);
  // The sides are darker than the top and almost always buried; what matters
  // is that they are not BRIGHTER, or a step would read as a kerb of light.
  return tintFaces(box, { top: 1.0, north: 1 - 0.22 * c, east: 1 - 0.3 * c });
}

/** Flat geometry for roads and other ground-level pieces. */
export function slabGeometry(styleName, w, h, d) {
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(0, h / 2, 0);
  const c = faceContrastFor(styleName);
  return tintFaces(box, { top: 1.0, north: 1 - 0.1 * c, east: 1 - 0.18 * c });
}

// --- materials --------------------------------------------------------------

/** The pixel style is UNLIT. Lighting produces smooth gradients across a face,
 * and smooth gradients are the one thing pixel art does not have — the shading
 * is baked into the vertices instead. */
export function makeMaterial(styleName, colour) {
  if (styleName === "pixel") {
    return new THREE.MeshBasicMaterial({ color: colour, vertexColors: true });
  }
  return new THREE.MeshLambertMaterial({ color: colour, vertexColors: true });
}
