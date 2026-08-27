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

// --- palettes ---------------------------------------------------------------

export const PALETTES = {
  // Soft, desaturated, cosy. A toy left on a table by a window.
  plain: {
    sky: 0xbfe0f0,
    // Vivid, cheerful, high-contrast — the reference's grass is almost
    // luminous and its water is cyan rather than navy. A cosy toy world does
    // not use realistic colours.
    terrain: [0x62c144, 0xc0a274, 0x3f9b34, 0x39c5e8, 0xa8ecfa, 0xa8a49e, 0xf0dfae, 0x74a05c],
    tree: 0x2f8f3a,
    zone: [0x000000, 0xefc9a4, 0x8fd0f0, 0xd9a45c],
    road: 0x6f7278,
    roadMark: 0xf2f2f2,
    wire: 0x8a8377,
    lamp: 0xb8bcc0,
    civic: 0xd8d2c6,
    roofFactor: 1.0,
    bandFactor: 1.0,
  },
  // Fewer, harder, more saturated colours. Deliberately reads as a limited
  // palette rather than as a lit 3D scene.
  pixel: {
    sky: 0x58a8d8,
    terrain: [0x58b038, 0xa8804a, 0x2f8830, 0x2878b8, 0x8fd8f0, 0x8f8f98, 0xe8d078, 0x5a8848],
    tree: 0x1f7a2f,
    zone: [0x000000, 0xe8b888, 0x58a8e8, 0xd89838],
    road: 0x5f6068,
    roadMark: 0xe8e4d8,
    wire: 0x7a7468,
    lamp: 0xa8acb0,
    civic: 0xa8a098,
    roofFactor: 0.72,
    bandFactor: 0.85,
  },
  // Warm and contrasty, with roofs and window bands doing the work that
  // texture would do in a drawn atlas.
  painted: {
    sky: 0xdcd8c0,
    terrain: [0x6aba48, 0xc09a60, 0x3f8f34, 0x2f96c8, 0x86d4ec, 0xa09890, 0xf0d69a, 0x789460],
    tree: 0x2a7f38,
    zone: [0x000000, 0xf0c8a0, 0x9fc8e8, 0xd8a860],
    road: 0x6b6672,
    roadMark: 0xc8b060,
    wire: 0x847d70,
    lamp: 0xb0b4b8,
    civic: 0xbfb6a6,
    roofFactor: 0.62,
    bandFactor: 0.74,
  },
};

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

/** Flat geometry for roads and other ground-level pieces. */
export function slabGeometry(styleName, w, h, d) {
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(0, h / 2, 0);
  return tintFaces(box, { top: 1.0, north: 0.9, east: 0.82 });
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

export function lightingFor(styleName) {
  if (styleName === "pixel") {
    // Enough ambient to keep basic materials at full colour; the faces are
    // already shaded.
    return { key: 0, keyColour: 0xffffff, hemiSky: 0xffffff, hemiGround: 0xffffff, hemi: 1.0 };
  }
  if (styleName === "painted") {
    // A low warm sun and a deep cool fill: long shadows, strong face contrast,
    // and colour that shifts between lit and unlit sides. That temperature
    // split is what an illustration does and a flat render does not.
    return { key: 3.1, keyColour: 0xffdca8, hemiSky: 0x86a8d8, hemiGround: 0x3f4a30, hemi: 0.85, sunHeight: 60 };
  }
  return { key: 1.9, keyColour: 0xfff4e0, hemiSky: 0xbcd8ff, hemiGround: 0x6b7a55, hemi: 1.2 };
}
