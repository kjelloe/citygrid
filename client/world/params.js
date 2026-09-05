// Building parameters: everything a building looks like, from what it is.
//
// One function, so every fidelity level draws the same house: the instanced
// box at city zoom and the facade at street level agree on variant, roof hue,
// wall colour and which way the door faces because they asked the same
// question (specs/engine/04-city-model.md §4.5). Nothing here is stored — a
// building's look is a function of its record and its id (ruling 032).

import { pseudo, jitter } from "./hash.js";
import { getConfig } from "./config.js";

export const VARIANTS = 4;

const ZONE_NONE = 0;
const ZONE_RESIDENTIAL = 1;
const ZONE_COMMERCIAL = 2;
const ZONE_INDUSTRIAL = 3;

const KINDS = ["none", "residential", "commercial", "industrial"];

/** The kit category a zone draws from. Civic is the unzoned default. */
export function kindOf(zone) {
  return zone === ZONE_RESIDENTIAL ? "residential"
    : zone === ZONE_COMMERCIAL ? "commercial"
      : zone === ZONE_INDUSTRIAL ? "industrial"
        : "civic";
}

/** The data key for a zone — `none` for civic, since the lot tables are per
 * zone and civic buildings are the unzoned ones. */
export function zoneKey(zone) {
  return KINDS[zone] ?? "none";
}

/** Which variant a building gets. Deterministic from its id, so a building
 * keeps its shape for its whole life and two clients agree on what it looks
 * like without the shape ever entering game state. */
export function variantFor(id, count = VARIANTS) {
  return Math.floor(pseudo(id * 7 + 3) * count) % count;
}

/** Nudges a colour per building: a little lightness, a little hue. Enough that
 * neighbours differ, little enough that the zone is still readable at a
 * glance, which is what the colour is actually for. */
export function varyColour(hex, id, amount = 1) {
  const shift = (salt) => (jitter(id, salt) - 0.5) * amount;
  const light = 1 + shift(23) * 0.34;
  const r = ((hex >> 16) & 0xff) * light * (1 + shift(29) * 0.2);
  const g = ((hex >> 8) & 0xff) * light * (1 + shift(31) * 0.16);
  const b = (hex & 0xff) * light * (1 + shift(37) * 0.22);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

export function darken(hex, factor) {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Which roof a building gets. Houses draw from tile and slate; everything
 * else from flat felt greys (ruling 021). Half the usual scatter, because a
 * roof colour is a material and materials vary less than paint does. */
export function roofColour(building, kind, palette) {
  const set = kind === "residential" ? palette.roof.house : palette.roof.flat;
  const pick = set[Math.floor(jitter(building.id, 53) * set.length) % set.length];
  return varyColour(pick, building.id * 3 + 11, 0.5);
}

/** The tint for an empty zoned lot: the zone's own colour, lightened towards
 * the ground so it reads as a marking on the land rather than a painted
 * surface (P29). */
export function zoneTint(zone, palette) {
  const base = palette.zone[zone] ?? 0x888888;
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  const lift = (v) => Math.min(255, Math.round(v * 0.82 + 255 * 0.18));
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}

/** Height at unit scale: development level sets it, a per-building jitter
 * stops a terrace looking extruded from a single profile. */
export function unitHeight(building) {
  const base = building.zone === ZONE_NONE
    ? 0.55 + building.w * 0.18
    : 0.45 + building.level * 0.5;
  return base * (0.88 + jitter(building.id, 17) * 0.3);
}

/** Storeys, for the street-level kit: one per development level over a
 * ground floor, and civic buildings two. Monotone in `unitHeight`, so the
 * facade and the box grow together. */
export function storeys(building) {
  if (building.zone === ZONE_NONE) return 2;
  return 1 + building.level;
}

/**
 * Everything the renderer needs to draw one building, at any level.
 *
 * `palette` is the style's palette and `family` is the colour the zone and
 * value tier give (`buildingColour`), passed in so this module stays free of
 * the render palette and testable in node. With `showOwner` the family is the
 * owner's seat colour and the roof a darkened version of it, so ownership
 * reads at a glance rather than hiding under a terracotta hat.
 */
export function buildingParams(building, palette, family, showOwner = false) {
  const kind = kindOf(building.zone);
  const cfg = getConfig();
  const key = zoneKey(building.zone);
  return {
    kind,
    variant: variantFor(building.id, VARIANTS),
    colour: showOwner ? family : varyColour(family, building.id),
    roof: showOwner ? darken(family, 0.62) : roofColour(building, kind, palette),
    height: unitHeight(building),
    storeys: storeys(building),
    floorH: cfg.lot.floorH[key],
    groundH: cfg.lot.groundH[key],
    // Quarter turns, so front doors do not all face the same way.
    spin: building.w === building.h
      ? Math.floor(jitter(building.id, 19) * 4) * (Math.PI / 2)
      : 0,
    // Houses and civic buildings stand on a garden, not on tarmac.
    lawn: kind === "residential" || kind === "civic"
      ? varyColour(palette.lawn, building.id * 5 + 3, 0.6)
      : 0,
  };
}
