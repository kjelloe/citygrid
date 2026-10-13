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
import { normalisedTint, tintedToonChunk, tintedLambertChunk, tintedOutgoing } from "./shadow-shader.js";
import { getConfig } from "../world/config.js";
import { STYLES } from "./style-table.js";
import { rampBytes } from "./ramps.js";

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

/** Flat geometry for roads and other ground-level pieces. */
export function slabGeometry(styleName, w, h, d) {
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(0, h / 2, 0);
  // **One side shade, not two** (S22). It was `north: 1 − 0.1 c` and
  // `east: 1 − 0.18 c`, which is a 5.6% difference between two walls of the
  // same slab on `plain` — an AZIMUTH frozen into the mesh, and since the sun
  // moves now it would read as wrong for half the day on a bridge deck. The
  // mean of the two is what is left: top against side, which is direction-free
  // because the sun is always above, and which is what keeps the pixel style's
  // unlit material reading as three-dimensional.
  //
  // The compass shades in `building-kit.js` and `detail-kit.js` were the same
  // defect an order of magnitude larger — nine pushes each, spanning 18.3% on
  // `plain` and 40% on `pixel`. **Q163 → A140 → S22c** took them off the lit
  // styles by taking `faceContrastFor` to 0 for them, which lands here too: on
  // `plain` and `painted` a slab's top and side are now one value and the
  // light separates them, and on `pixel` the bake still does, because that
  // style has no other light.
  const c = faceContrastFor(styleName);
  const side = 1 - 0.14 * c;
  return tintFaces(box, { top: 1.0, north: side, east: side });
}

// --- materials --------------------------------------------------------------

/** Gradient maps, one per ramp name, built once and shared.
 *
 * NEAREST at both ends, and that is the whole point: a linearly filtered
 * gradient map interpolates between the bands and the quantisation is gone —
 * it reads as slightly banded Lambert rather than as a drawing. */
const gradientMaps = new Map();
function gradientMap(kind) {
  let map = gradientMaps.get(kind);
  if (map) return map;
  const bytes = rampBytes(kind);
  map = new THREE.DataTexture(bytes, bytes.length, 1, THREE.RedFormat);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  gradientMaps.set(kind, map);
  return map;
}

/** Tints the unlit side rather than merely darkening it.
 *
 * A toon material's shadow side is the ramp's dark end times the light's own
 * colour, which makes it a darker version of the lit side. An illustration does
 * something else: the shadow takes the colour of what is filling it — cool
 * against a warm key — and that temperature split is most of what separates a
 * drawing from a render (spec §7.2).
 *
 * This is string surgery on three's own shader and therefore the most brittle
 * thing in the renderer: a version bump changes a chunk and the patch either
 * does nothing or produces a shader that will not compile. So it looks before
 * it leaps and says so when the shape is not what it expected.
 */
let warnedAboutTint = false;

/** Says once, and only once, that a patch could not find its anchor.
 *
 * Not an exception: a style that loses its shadow tint looks slightly wrong and
 * a renderer that will not start is a game nobody can play. **But a warning is
 * not a gate** — this one fired on every run for the life of the toon patch and
 * nothing collected it (S22e), so `client_smoke` reads the console now. */
function warnOnce(what) {
  if (warnedAboutTint) return;
  warnedAboutTint = true;
  console.warn(`shadow tint: three's ${what} has changed shape; shadows will darken `
    + "rather than take a colour");
}

/**
 * The shadow's colour, for a toon material (`painted`) or a Lambert one
 * (`plain`).
 *
 * **It patches by EXPANDING the chunk.** `onBeforeCompile` is handed a shader
 * whose `#include <…>` directives are not yet resolved, so a replace aimed at a
 * line inside one never matches — which is what the toon patch did for its
 * whole life, warning once into a console nobody read while spec §7.2's
 * temperature split was silently absent (S22e). The transforms are in
 * `shadow-shader.js`, which is pure, so a node test can drive them over three's
 * real chunks rather than reading this file for the word "warn".
 */
function tintShadows(material, tint, shading) {
  material.userData.shadowTint = tint;
  const colour = normalisedTint(new THREE.Color(tint));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = { value: new THREE.Color(colour.r, colour.g, colour.b) };
    // **The uniform is declared at GLOBAL scope**, which is what `#include
    // <common>` is and what `lights_fragment_begin` is not: it sits inside
    // `main()`, and declaring a uniform there is a shader that will not
    // compile — "only allowed at global scope", which is what the first run of
    // this patch said in a console error.
    const declare = (source) => source.replace(
      "#include <common>", "uniform vec3 uShadowTint;\n#include <common>",
    );
    if (shading === "toon") {
      const chunk = tintedToonChunk(THREE.ShaderChunk.lights_toon_pars_fragment);
      if (!chunk) { warnOnce("lights_toon_pars_fragment"); return; }
      shader.fragmentShader = declare(shader.fragmentShader)
        .replace("#include <lights_toon_pars_fragment>", chunk);
      return;
    }
    // Lambert: the shadow has to be remembered where it is computed, because a
    // surface in shadow has simply lost the key light by the time the colour is
    // assembled (S22e).
    const lighting = tintedLambertChunk(THREE.ShaderChunk.lights_fragment_begin);
    const outgoing = tintedOutgoing(shader.fragmentShader);
    if (!lighting || !outgoing) { warnOnce(lighting ? "the fragment shader" : "lights_fragment_begin"); return; }
    shader.fragmentShader = declare(outgoing)
      .replace("#include <lights_fragment_begin>", lighting);
  };
  // Two materials that differ only in a uniform still share a program; one that
  // differs in its SOURCE must not.
  material.customProgramCacheKey = () => `${shading}-tint-${tint}`;
  return material;
}

/**
 * Patches a material to blend an overlay byte plane over its vertex colour
 * (slice V7, ruling 041).
 *
 * The TERRAIN material only. `uOverlay` is one byte a tile sampled at world
 * x/z; `uOverlayOn` is the wash's opacity, zero when no overlay is showing;
 * `uBands` is the four-entry colour array the byte indexes. The wash follows
 * any slope because it is the ground's own colour for that frame, and toggling
 * an overlay uploads `width × height` bytes and rebuilds nothing.
 *
 * `PLANE_NONE` is a sentinel rather than a band: a tile the overlay is silent
 * about shows the city, not a wash of grey over it.
 *
 * Over `outgoingLight`, not into `diffuseColor`. Mixed in before the light, the
 * wash is shaded with the grass — which looks right and reads wrong: on the
 * `hilly` fixture at a low pitch the darkest twentieth of the ground separated
 * adjacent bands by 25 in 8-bit RGB against E6's floor of 30, so a slope in
 * shadow turned amber and red into one colour. Over the lit result the
 * separation is the palette's own gap times the wash, everywhere, and the
 * ground's shading still shows through the 45% that is left (slice V7).
 */
export function overlayed(material, uniforms) {
  // CHAINED, not assigned. The painted style's terrain is a toon material whose
  // shadow tint is already an `onBeforeCompile` patch, and overwriting it would
  // silently take the temperature split out of the ground (slice V7).
  const already = material.onBeforeCompile;
  const wasKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    already?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        varying vec3 vGroundWorld;`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
        vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vGroundWorld;
        uniform sampler2D uOverlay;
        uniform float uOverlayOn;
        uniform vec2 uMapSize;
        uniform vec3 uBands[4];`)
      .replace("#include <opaque_fragment>", `
        if (uOverlayOn > 0.0) {
          vec2 cell = floor(vGroundWorld.xz);
          vec2 uv = (cell + 0.5) / uMapSize;
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
            float raw = texture2D(uOverlay, uv).r * 255.0;
            if (raw < 3.5) {
              outgoingLight = mix(outgoingLight, uBands[int(raw + 0.5)], uOverlayOn);
            }
          }
        }
        #include <opaque_fragment>`);
    material.userData.shader = shader;
  };
  // A patched material is a different program; without this three reuses the
  // cached one and the patch never runs.
  material.customProgramCacheKey = () => `overlay|${wasKey ? wasKey() : ""}`;
  return material;
}

/** The material a style's surfaces are made of, chosen by its `shading` field
 * and never by its name (spec §7.1).
 *
 * - `unlit`: lighting produces smooth gradients across a face, and smooth
 *   gradients are the one thing pixel art does not have — the shading is baked
 *   into the vertices instead.
 * - `toon`: the shade comes from a ramp texture, so a wall is two or three
 *   flat values rather than a continuum.
 * - `lambert`: the default.
 */
export function makeMaterial(styleName, colour) {
  const style = STYLES[styleName] ?? STYLES.plain;
  const shading = style.shading ?? "lambert";
  if (shading === "unlit") {
    return new THREE.MeshBasicMaterial({ color: colour, vertexColors: true });
  }
  if (shading === "toon") {
    const material = new THREE.MeshToonMaterial({
      color: colour,
      vertexColors: true,
      gradientMap: gradientMap(style.ramp ?? "3"),
    });
    return tintShadows(material, lightingFor(styleName).shadowTint ?? 0x6a6ea8, "toon");
  }
  // **And the Lambert path too** (S22e). A145 asked for "the tint cooler rather
  // than the ground darker" and S22d could only give the second half, because
  // this was the branch with no patch at all — `plain` is the style the game
  // ships with.
  return tintShadows(
    new THREE.MeshLambertMaterial({ color: colour, vertexColors: true }),
    lightingFor(styleName).shadowTint ?? getConfig().shadow.tint, "lambert",
  );
}
