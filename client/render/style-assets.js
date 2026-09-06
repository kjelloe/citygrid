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
  const c = faceContrastFor(styleName);
  return tintFaces(box, { top: 1.0, north: 1 - 0.1 * c, east: 1 - 0.18 * c });
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
const TOON_ANCHOR = "vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction );";
let warnedAboutToon = false;

function tintShadows(material, tint) {
  material.userData.shadowTint = tint;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = { value: new THREE.Color(tint) };
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_toon_pars_fragment>",
      "uniform vec3 uShadowTint;\n#include <lights_toon_pars_fragment>",
    );
    if (!shader.fragmentShader.includes(TOON_ANCHOR)) {
      if (!warnedAboutToon) {
        warnedAboutToon = true;
        // Not an exception: a style that loses its shadow tint is a style that
        // looks slightly wrong, and a renderer that will not start is a game
        // nobody can play.
        console.warn("toon shadow tint: three's lights_toon_pars_fragment has changed shape; "
          + "shadows will darken rather than take a colour");
      }
      return;
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      TOON_ANCHOR,
      `${TOON_ANCHOR}
      irradiance = mix( uShadowTint * ( 1.0 - irradiance.r ), irradiance, irradiance.r );`,
    );
  };
  // Two materials that differ only in a uniform still share a program; one that
  // differs in its SOURCE must not.
  material.customProgramCacheKey = () => `toon-tint-${tint}`;
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
    return tintShadows(material, lightingFor(styleName).shadowTint ?? 0x6a6ea8);
  }
  return new THREE.MeshLambertMaterial({ color: colour, vertexColors: true });
}
