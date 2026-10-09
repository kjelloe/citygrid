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

/**
 * How hard this style bakes its face shading. See detail-kit's `contrast`.
 *
 * **Only the unlit style bakes anything now** (S22c, A140 ← Q163). The kits
 * push a fixed compass shade — S 0.88 / E 0.8 / N 0.7 / W 0.62 — into every
 * roof, gable and prop, which is a sun DIRECTION frozen into the geometry. S22
 * gave the city a sun that crosses the sky and S22b stood it where its shadows
 * can be seen; a baked direction underneath that is the light arguing with
 * itself, and as rendered the baked sides spanned 18.3% of the range on `plain`
 * against 5.6% for the slab tint S22 had already removed.
 *
 * `pixel` is the exception and has to be: `lightingFor` gives it `key: 0`, so
 * the bake is its ONLY light. "A style with no baked contrast at all loses its
 * form" has been true of it since P1 and still is — `test/toon.test.js` keeps
 * both halves now, the rule for pixel and its inverse for the lit styles.
 *
 * What this replaced, kept because the ladder is the decision: `painted` was
 * 0.3 (a toon ramp already quantises, and at 1.0 a wall read as two flat
 * sheets, P1) and `plain` was 0.65 (0.4 was tried first and lost the form —
 * soft means gentle, not absent). Both of those were about how much bake to
 * keep under a FIXED light. There is no fixed light any more.
 */
export function faceContrastFor(styleName) {
  if (styleName === "pixel") return 1.3;
  return 0;
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
