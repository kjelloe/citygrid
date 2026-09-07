// Where the haze starts and how big the sky is (slice V8; spec §7.3).
//
// Pure — no three — because both are arithmetic that is wrong in a way a
// screenshot shows only if somebody happens to press F at the right zoom.
//
// The city camera's fog follows the ZOOM, and it has to: the same numbers are
// invisible on a 64-tile map and opaque on a 128-tile one. A walker's eye does
// not zoom. Street mode inherited the city's `span` anyway, so the haze at eye
// height was a function of how far out the player had been standing before they
// pressed F — a distance with no meaning down there.
//
// And the sky dome is a 1,800-tile sphere while street mode's far plane is 100,
// so at eye height the sky was entirely BEHIND it: what the player saw was the
// flat clear colour, with the dome's whole gradient thrown away. A low sun with
// no gradient under it is the one thing dusk is for.

import { getConfig } from "../world/config.js";

/** The smallest span the city's haze is computed against. At span 2 a
 * `fogNear` of 1.4 is three tiles, and a city fading out three tiles from the
 * camera is a city in a jar. */
const MIN_SPAN = 12;

/**
 * The haze, in TILE units — the whole scene is — or `undefined` when there
 * should not be any.
 *
 * `hour` scales both ends, so a preset's `fogNear`/`fogFar` still mean
 * something at eye height: dusk closes in and noon does not.
 */
export function fogFor(view, hour, cfg = getConfig()) {
  // Orthographic has no horizon to fade into (V5).
  if (view.mode === "ortho") return undefined;
  if (view.mode === "street") {
    const tileM = cfg.tileM;
    // Metres, and the hour is a factor on them rather than the whole answer:
    // the preset's numbers are ratios of a reach, and down here the reach is a
    // fixed one.
    const near = (cfg.fog.streetNear / tileM) * (hour.fogNear / 1.4);
    const far = (cfg.fog.streetFar / tileM) * (hour.fogFar / 5);
    return { near, far: Math.min(far, (view.persp?.far ?? 100) * 0.999) };
  }
  const reach = Math.max(view.span, MIN_SPAN);
  return { near: reach * hour.fogNear, far: reach * hour.fogFar };
}

/**
 * How big the sky dome should be, in tiles.
 *
 * Inside the far plane — a dome beyond it is not drawn at all — and beyond the
 * fog, or it is painted flat and stops being a gradient.
 */
export function skyRadiusFor(view, cfg = getConfig()) {
  const far = view.persp?.far ?? 4000;
  return far * cfg.fog.domeShare;
}
