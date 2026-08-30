// The eleven information overlays (gamedesign.md §16).
//
// Pure: state in, a band per tile out. No three.js, no DOM. The renderer turns
// bands into colour and pattern; this decides what the band IS, and that is the
// part that can be quietly wrong — an overlay reading the `wire` layer instead
// of the powered flag shows a fully-lit city whose plant burnt down an hour
// ago, which is precisely the state the player opened it to diagnose.
//
// Four bands, and the colours are fixed by the design:
//   GOOD    green   supplied, safe, valuable
//   FAIR    yellow  strained, moderate
//   SEVERE  red     failing, severe
//   NONE    grey    not applicable — bare land, open water, no network here
//
// Grey is load-bearing. Painting the sea amber for crime is noise in every
// screenshot and in every diff, and it trains the player to ignore the overlay.
//
// **Never colour alone** (§16, §30): every overlay ships a legend, and the
// renderer draws a per-band pattern as well as a per-band colour.

import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  FLAG_POWERED, FLAG_WATERED,
  TERRAIN_WATER, TERRAIN_SHALLOW,
} from "../constants-mirror.js";
import { NET_PRESENT } from "../constants-mirror.js";

export const BAND = { GOOD: 0, FAIR: 1, SEVERE: 2, NONE: 3 };

/** Rising values are worse: pollution, crime, health risk, traffic. */
function severity(value, fair, severe) {
  if (value >= severe) return BAND.SEVERE;
  if (value >= fair) return BAND.FAIR;
  return BAND.GOOD;
}

/** Rising values are better: land value, desirability, coverage. */
function quality(value, fair, good) {
  if (value >= good) return BAND.GOOD;
  if (value >= fair) return BAND.FAIR;
  return BAND.SEVERE;
}

function isWater(state, index) {
  const terrain = state.tiles.terrain[index];
  return terrain === TERRAIN_WATER || terrain === TERRAIN_SHALLOW;
}

const has = (mask) => (mask & NET_PRESENT) !== 0;

export const OVERLAYS = {
  zoning: {
    labelKey: "overlay.zoning",
    // The one overlay whose bands are categories rather than a scale, so its
    // legend names the zones instead of good/fair/severe.
    legend: [
      { band: BAND.GOOD, textKey: "zone.residential" },
      { band: BAND.FAIR, textKey: "zone.commercial" },
      { band: BAND.SEVERE, textKey: "zone.industrial" },
      { band: BAND.NONE, textKey: "legend.unzoned" },
    ],
    band(state, index) {
      const zone = state.tiles.zone[index];
      if (zone === ZONE_RESIDENTIAL) return BAND.GOOD;
      if (zone === ZONE_COMMERCIAL) return BAND.FAIR;
      if (zone === ZONE_INDUSTRIAL) return BAND.SEVERE;
      return BAND.NONE;
    },
  },

  power: {
    labelKey: "overlay.power",
    legend: [
      { band: BAND.GOOD, textKey: "legend.supplied" },
      { band: BAND.SEVERE, textKey: "legend.unsupplied" },
      { band: BAND.NONE, textKey: "legend.noWire" },
    ],
    band(state, index) {
      if (!has(state.tiles.wire[index])) return BAND.NONE;
      // The flag, not the wire. A wire with no generation behind it is the
      // failure this overlay exists to show.
      return (state.tiles.flags[index] & FLAG_POWERED) !== 0 ? BAND.GOOD : BAND.SEVERE;
    },
  },

  water: {
    labelKey: "overlay.water",
    legend: [
      { band: BAND.GOOD, textKey: "legend.supplied" },
      { band: BAND.SEVERE, textKey: "legend.dry" },
      { band: BAND.NONE, textKey: "legend.noPipe" },
    ],
    band(state, index) {
      if (!has(state.tiles.pipe[index])) return BAND.NONE;
      return (state.tiles.flags[index] & FLAG_WATERED) !== 0 ? BAND.GOOD : BAND.SEVERE;
    },
  },

  traffic: {
    labelKey: "overlay.traffic",
    legend: [
      { band: BAND.GOOD, textKey: "legend.clear" },
      { band: BAND.FAIR, textKey: "legend.busy" },
      { band: BAND.SEVERE, textKey: "legend.congested" },
      { band: BAND.NONE, textKey: "legend.noRoad" },
    ],
    band(state, index) {
      // The layer exists and is all zeros until the traffic slice fills it, so
      // this currently paints every road clear. That is honest — it reports the
      // measurement, and there is no measurement yet.
      if (!has(state.tiles.road[index])) return BAND.NONE;
      return severity(state.tiles.traffic[index], 90, 180);
    },
  },

  landValue: {
    labelKey: "overlay.landValue",
    legend: [
      { band: BAND.GOOD, textKey: "legend.high" },
      { band: BAND.FAIR, textKey: "legend.middling" },
      { band: BAND.SEVERE, textKey: "legend.low" },
      { band: BAND.NONE, textKey: "legend.water" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      return quality(state.tiles.landValue[index], 90, 150);
    },
  },

  pollution: {
    labelKey: "overlay.pollution",
    legend: [
      { band: BAND.GOOD, textKey: "legend.clean" },
      { band: BAND.FAIR, textKey: "legend.hazy" },
      { band: BAND.SEVERE, textKey: "legend.foul" },
      { band: BAND.NONE, textKey: "legend.water" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      return severity(state.tiles.pollution[index], 60, 150);
    },
  },

  crime: {
    labelKey: "overlay.crime",
    legend: [
      { band: BAND.GOOD, textKey: "legend.quiet" },
      { band: BAND.FAIR, textKey: "legend.some" },
      { band: BAND.SEVERE, textKey: "legend.rife" },
      { band: BAND.NONE, textKey: "legend.water" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      return severity(state.tiles.crime[index], 60, 150);
    },
  },

  fire: {
    labelKey: "overlay.fire",
    legend: [
      { band: BAND.GOOD, textKey: "legend.covered" },
      { band: BAND.FAIR, textKey: "legend.thinCover" },
      { band: BAND.SEVERE, textKey: "legend.atRisk" },
      { band: BAND.NONE, textKey: "legend.nothingToBurn" },
    ],
    band(state, index) {
      // Risk is only meaningful where there is something to lose.
      if (isWater(state, index)) return BAND.NONE;
      if (state.tiles.buildingId[index] === 0 && state.tiles.zone[index] === 0) return BAND.NONE;
      return severity(state.tiles.fireRisk[index], 70, 160);
    },
  },

  health: {
    labelKey: "overlay.health",
    legend: [
      { band: BAND.GOOD, textKey: "legend.healthy" },
      { band: BAND.FAIR, textKey: "legend.strained" },
      { band: BAND.SEVERE, textKey: "legend.poor" },
      { band: BAND.NONE, textKey: "legend.water" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      return severity(state.tiles.healthRisk[index], 70, 160);
    },
  },

  density: {
    labelKey: "overlay.density",
    legend: [
      { band: BAND.SEVERE, textKey: "legend.dense" },
      { band: BAND.FAIR, textKey: "legend.moderate" },
      { band: BAND.GOOD, textKey: "legend.sparse" },
      { band: BAND.NONE, textKey: "legend.empty" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      const id = state.tiles.buildingId[index];
      if (id === 0) return BAND.NONE;
      const building = state.buildings.find((b) => b.id === id);
      if (!building || building.occupancy === undefined) return BAND.NONE;
      // Density is not a problem, so its scale runs the other way from crime's:
      // dense is red only in the sense of "most people here".
      return severity(building.occupancy, 12, 40);
    },
  },

  desirability: {
    labelKey: "overlay.desirability",
    legend: [
      { band: BAND.GOOD, textKey: "legend.soughtAfter" },
      { band: BAND.FAIR, textKey: "legend.ordinary" },
      { band: BAND.SEVERE, textKey: "legend.shunned" },
      { band: BAND.NONE, textKey: "legend.water" },
    ],
    band(state, index) {
      if (isWater(state, index)) return BAND.NONE;
      // The same trade the development pass makes when it scores a lot: value
      // is what draws people, nuisance is what drives them off. Derived here
      // rather than stored, because a stored copy would be a second source of
      // truth for a number the reducer already owns.
      const value = state.tiles.landValue[index];
      const nuisance = (state.tiles.pollution[index] + state.tiles.crime[index]) / 2;
      return quality(Math.max(0, value - nuisance), 60, 130);
    },
  },
};

export const OVERLAY_NAMES = Object.keys(OVERLAYS);

export function bandAt(state, name, index) {
  const overlay = OVERLAYS[name];
  if (!overlay) return BAND.NONE;
  return overlay.band(state, index);
}

export function legendFor(name) {
  return OVERLAYS[name]?.legend ?? [];
}

/** The i18n key for an overlay's name. Ruling 008: the model decides WHICH
 * string, the view decides what it says in the player's language. */
export function labelKeyFor(name) {
  return OVERLAYS[name]?.labelKey ?? "";
}
