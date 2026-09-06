// Toon gradient ramps (slice P1; ruling 033, spec §7.1).
//
// A `MeshToonMaterial` reads its shading from a one-dimensional texture: the
// dot product of normal and light picks a texel, and that texel IS the shade.
// So the ramp is the entire difference between "a lit surface" and "a drawn
// one" — the bands, where they fall, and how hard the steps are.
//
// Pure, and separate from `style-assets.js`, because three cannot be resolved
// in node and this is the half worth testing: a ramp that goes backwards, or
// that never reaches full light, is a picture nobody can read.

/** The ramps a style may name. Numbers are hard band counts; the `soft` ones
 * have the same number of steps with the transitions carrying part of the
 * difference, which is what stops a ramp reading as a poster. */
export const RAMPS = ["2", "3", "4", "soft", "soft3"];

const TABLE = {
  // Two bands: lit and unlit, the strongest reading and the one that needs the
  // fill light most.
  2: [90, 255],
  3: [72, 168, 255],
  4: [58, 128, 190, 255],
  // Five steps that cluster near the terminator, so the change from shadow to
  // light happens over three of them rather than one.
  soft: [96, 132, 176, 216, 255],
  // Three bands with a half-step either side of the middle one.
  soft3: [84, 122, 168, 210, 255],
};

/** The ramp as bytes, dark end first. An unknown name falls back to three
 * bands: a style is data and a typo in it must not be a black screen. */
export function rampBytes(kind) {
  return Uint8Array.from(TABLE[kind] ?? TABLE[3]);
}
