// Colour-vision simulation, shared by the tests that check a palette.
//
// Brettel-style and simplified: project the colour onto the plane a given
// dichromat can see. Good enough to catch a pair that collapses, which is the
// only question either caller asks (§30, ruling 017).
//
// Lifted out of `test/render.test.js` when `test/toon.test.js` needed the same
// arithmetic for the painted palette — two copies of a colour model is two
// answers to one question.

export function simulate(hex, kind) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  if (kind === "normal") return [r, g, b];
  // Linearise, convert to LMS, flatten the missing channel, come back.
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r); const G = lin(g); const B = lin(b);
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.08670 * B;
  const S = 0.01775 * R + 0.10944 * G + 0.87262 * B;
  let l = L; let m = M; let s = S;
  if (kind === "protan") l = 1.05118294 * M - 0.05116099 * S;
  if (kind === "deutan") m = 0.9513092 * L + 0.04866992 * S;
  if (kind === "tritan") s = -0.86744736 * L + 1.86727089 * M;
  return [
    5.47221206 * l - 4.6419601 * m + 0.16963708 * s,
    -1.1252419 * l + 2.29317094 * m - 0.1678952 * s,
    0.02980165 * l - 0.19318073 * m + 1.16364789 * s,
  ];
}

/** Perceptual-ish distance. Crude, but the question is only "could these two be
 * confused", and for that a Euclidean distance in linear light is enough. */
export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
