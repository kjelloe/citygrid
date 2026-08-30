// How each style is lit, and how hard it bakes its shading.
//
// Pure: no three.js, no geometry. That is deliberate — this is the part of a
// style that decides whether it looks like a different style at all, so it has
// to be testable without a browser.
//
// The three candidates were once called out for looking alike, and the reason
// was here rather than in the geometry: face shading is baked into every
// vertex at build time, so it dominates whatever the lights do afterwards. A
// style that wants soft light has to bake soft shading too.

/** How hard this style bakes its face shading. See detail-kit's `contrast`. */
export function faceContrastFor(styleName) {
  if (styleName === "pixel") return 1.3;
  if (styleName === "painted") return 1.0;
  // 0.4 was tried first and was a mistake: at that setting a roof and the wall
  // under it land on the same value and the building loses its form. Soft
  // means gentle, not absent.
  return 0.65;
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
    return { key: 3.1, keyColour: 0xffdca8, hemiSky: 0x86a8d8, hemiGround: 0x3f4a30, hemi: 0.85, sunHeight: 60, shadowRadius: 1.5, shadowIntensity: 1 };
  }
  // Plain is the SOFT one, and softness is not a smaller number on the same
  // light — it is a different arrangement. The key drops until it barely
  // sculpts, the hemisphere fill carries most of the exposure, and the sun
  // stands almost overhead so shadows are short and sit under a building
  // rather than stretching away from it. The reference reads as an evenly lit
  // model on a table, and this is what that is made of.
  return {
    key: 1.15,
    keyColour: 0xfffaf0,
    hemiSky: 0xdcecff,
    hemiGround: 0x93aa78,
    hemi: 1.25,
    sunHeight: 150,
    shadowRadius: 5,
    shadowIntensity: 0.5,
  };
}
