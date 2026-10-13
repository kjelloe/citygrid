// The shadow's colour, as string surgery that can be tested (S22e).
//
// Pure: no three, no DOM, no geometry — it takes a shader chunk's text and
// gives back the patched text, so `test/shadow-tint.test.js` can drive it over
// three's real chunks in node. That is the whole reason this file exists apart
// from `style-assets.js`, and the reason is a defect:
//
// **`onBeforeCompile` is handed a shader whose `#include <…>` directives are
// not yet resolved.** The toon tint patched a line from INSIDE
// `lights_toon_pars_fragment`, so the replace never matched, the warning fired
// once into a console nobody collects, and the painted style's shadows have
// darkened rather than taken a colour for the whole life of the rig — spec
// §7.2's temperature split, silently absent. The test that was supposed to
// hold it asserted the SHAPE of the code (`a-test-that-transcribes-a-line`).
//
// So a patch here expands the chunk itself and returns `undefined` when the
// chunk is not the shape it expected, and the caller says so out loud.

/** A colour, as three sees it, divided by its own luminance.
 *
 * "Cooler rather than darker" (A145) is a claim about LUMINANCE: multiplying a
 * shadowed pixel by a tint of luminance 1 moves its hue and leaves its value
 * where the shadow's own strength put it. A raw `0x6f6ba8` would darken the
 * shadow a second time, on top of S22d's ladder. */
export function normalisedTint({ r, g, b }) {
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  if (!(luminance > 0)) return { r: 1, g: 1, b: 1 };
  return { r: r / luminance, g: g / luminance, b: b / luminance };
}

/** The line a toon shader computes its banded irradiance on.
 *
 * **With `* directLight.color`**, which the old constant left off — so the
 * patch could not have matched even once the include was resolved. Two
 * mistakes, one silent failure. */
export const TOON_ANCHOR = "vec3 irradiance = getGradientIrradiance( geometryNormal, "
  + "directLight.direction ) * directLight.color;";

/**
 * `lights_toon_pars_fragment`, with the shadow taking the tint.
 *
 * The toon ramp bands the direct light; where the band is dark the surface is
 * in shadow, and `irradiance.r` is how lit it is. Mixing toward the tint by
 * that amount is the temperature split: cool where the key does not reach,
 * the key's own colour where it does.
 */
export function tintedToonChunk(chunk) {
  if (typeof chunk !== "string" || !chunk.includes(TOON_ANCHOR)) return undefined;
  return chunk.replace(
    TOON_ANCHOR,
    `${TOON_ANCHOR}
\tirradiance = mix( uShadowTint * ( 1.0 - irradiance.r ), irradiance, irradiance.r );`,
  );
}

/** The line a Lambert shader multiplies the key light by, in shadow. */
export const LAMBERT_ANCHOR = "directLight.color *= ( directLight.visible && receiveShadow ) ? "
  + "getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, "
  + "directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, "
  + "directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";

/**
 * `lights_fragment_begin`, with the directional shadow's own factor kept.
 *
 * A Lambert surface in shadow simply loses the key light, so there is nothing
 * left to tint by the time the colour is assembled: the shadow has to be
 * REMEMBERED where it is computed. `cgShadow` is 1 in full light and 0 in full
 * shadow, and `tintedOpaqueChunk` below is what spends it.
 */
export function tintedLambertChunk(chunk) {
  if (typeof chunk !== "string" || !chunk.includes(LAMBERT_ANCHOR)) return undefined;
  return `float cgShadow = 1.0;\n${chunk}`.replace(
    LAMBERT_ANCHOR,
    `float cgShadowOne = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], `
    + `directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, `
    + `directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, `
    + `vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\tcgShadow = min( cgShadow, cgShadowOne );`
    + `\n\t\tdirectLight.color *= cgShadowOne;`,
  );
}

/** Where the lit colour becomes the pixel.
 *
 * In the fragment shader's OWN source rather than in a chunk — `meshlambert_frag`
 * and `meshtoon_frag` both assemble it the same way — which means this one line
 * is present in `shader.fragmentShader` as handed to `onBeforeCompile`, and no
 * expansion is needed. */
export const OUTGOING_ANCHOR = "vec3 outgoingLight = reflectedLight.directDiffuse + "
  + "reflectedLight.indirectDiffuse + totalEmissiveRadiance;";

/** The shader, with the shadowed part of the pixel pulled toward the tint — by
 * HUE, because the tint's luminance is 1. */
export function tintedOutgoing(source) {
  if (typeof source !== "string" || !source.includes(OUTGOING_ANCHOR)) return undefined;
  return source.replace(
    OUTGOING_ANCHOR,
    `${OUTGOING_ANCHOR}
\toutgoingLight = mix( outgoingLight * uShadowTint, outgoingLight, cgShadow );`,
  );
}
