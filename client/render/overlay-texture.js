// The overlay as a byte plane (slice V7; ruling 041).
//
// One byte a tile — the band — uploaded when the overlay changes and sampled by
// world x/z in the terrain material. It replaces 24,000 instanced quads that
// sat at the mean of each tile's four corners and grazed every slope: a texture
// on the ground IS the ground's colour for that frame, so it follows any relief
// for nothing, and toggling an overlay rebuilds no geometry at all.
//
// Pure: filling the plane is arithmetic over a typed array, and the band
// functions it reads are already pure and tested (`client/ui/overlays.js`).
// `style-assets.js` owns the texture and the shader patch, which need three.

import { bandAt, BAND } from "../ui/overlays.js";

/**
 * What "this tile has nothing to say" is written as.
 *
 * Not `BAND.NONE`, which is 3: the shader indexes a four-entry colour array
 * with the byte, and a grey wash over the tiles an overlay is silent about is
 * exactly what ruling 041 and the instanced pass before it both refused — a
 * tile with nothing to say is more useful showing the city. A sentinel the
 * shader compares against keeps the band values as indices.
 */
export const PLANE_NONE = 255;

/**
 * Fills `plane` with one band per tile and returns how many bytes it wrote.
 *
 * An unknown or empty overlay name clears the plane, because the alternative is
 * the previous overlay still painted on the ground after it was switched off.
 */
export function fillOverlayPlane(plane, state, name) {
  const tiles = state.width * state.height;
  if (!name) {
    plane.fill(PLANE_NONE, 0, tiles);
    return tiles;
  }
  for (let index = 0; index < tiles; index += 1) {
    const band = bandAt(state, name, index);
    plane[index] = band === BAND.NONE ? PLANE_NONE : band;
  }
  return tiles;
}
