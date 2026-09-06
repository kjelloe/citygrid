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
  // A toon ramp already quantises; baked contrast on top of it multiplies, and
  // at 1.0 a wall read as two flat sheets with the form gone (slice P1).
  if (styleName === "painted") return 0.3;
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
    // The ANIME rig (spec §7.2). Four lights, and the interesting one is not
    // the key.
    //
    // What makes a coloured shadow is the FILL: a strong cool light from the
    // opposite quarter carries the whole unlit side, so the shadow is a
    // different HUE rather than a darker version of the lit side. A rig that
    // only turned the key up would give a brighter picture of the same thing.
    // The violet up-light is the bounce off the ground that stops the undersides
    // of eaves and awnings going to black — the thing a toon ramp does most
    // readily and most wrongly.
    return {
      // Total exposure matters more than any one number here. A toon ramp
      // clamps the diffuse term, so four lights at the intensities the
      // reference rig uses under a physically-lit renderer sum past the top of
      // the ramp and every surface lands on its brightest band — measured as a
      // washed-out picture with the form gone. Plain totals about 2.4; this
      // totals about 3.0, and the extra is what the cool fill costs.
      key: 1.5,
      keyColour: 0xffd9a0,
      fill: 0.62,
      fillColour: 0x8fb6e8,
      up: 0.2,
      upColour: 0xb09ad8,
      hemiSky: 0xa8c0e8,
      hemiGround: 0x6a5a86,
      hemi: 0.68,
      sunHeight: 60,
      shadowRadius: 2.5,
      // Less than 1, deliberately: a low sun casts long shadows and at full
      // strength they swallow the cool fill that is supposed to colour them.
      shadowIntensity: 0.72,
      // What the toon material tints its unlit side with.
      shadowTint: 0x6f6aa8,
    };
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
