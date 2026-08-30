// The inspector: everything true about one tile, as data.
//
// This is the design's "click anything and learn why" (§13.1, §17). It reads
// state and never writes it, and it reports what the simulation says rather
// than what the UI would like to be true — if a lot is unpowered the inspector
// says so, even when the player just built the wire.

import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  FLAG_POWERED, FLAG_WATERED, FLAG_BURNING, FLAG_RUINED,
  TERRAIN_GRASS, TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_SHALLOW,
  NET_PRESENT,
} from "../constants-mirror.js";
import { OVERLAY_NAMES, labelKeyFor, bandAt, BAND } from "./overlays.js";

const TERRAIN_KEYS = {
  [TERRAIN_GRASS]: "terrain.grass",
  [TERRAIN_FOREST]: "terrain.forest",
  [TERRAIN_WATER]: "terrain.water",
  [TERRAIN_SHALLOW]: "terrain.shallow",
};

const ZONE_KEYS = {
  [ZONE_RESIDENTIAL]: "zone.residential",
  [ZONE_COMMERCIAL]: "zone.commercial",
  [ZONE_INDUSTRIAL]: "zone.industrial",
};

const BAND_WORD_KEYS = ["band.good", "band.fair", "band.severe", "band.none"];

/** Every key this model can hand the view, for the catalogue parity test. */
export function inspectorKeys() {
  return [
    ...Object.values(TERRAIN_KEYS), "terrain.ground",
    ...Object.values(ZONE_KEYS),
    ...BAND_WORD_KEYS,
    "inspect.landValue", "inspect.pollution", "inspect.crime",
    "inspect.fireRisk", "inspect.healthRisk", "inspect.traffic",
  ];
}

export function inspect(state, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return undefined;
  const index = y * state.width + x;
  const flags = state.tiles.flags[index];
  const id = state.tiles.buildingId[index];
  const building = id === 0 ? undefined : state.buildings.find((b) => b.id === id);

  const rows = [
    { labelKey: "inspect.landValue", value: state.tiles.landValue[index] },
    { labelKey: "inspect.pollution", value: state.tiles.pollution[index] },
    { labelKey: "inspect.crime", value: state.tiles.crime[index] },
    { labelKey: "inspect.fireRisk", value: state.tiles.fireRisk[index] },
    { labelKey: "inspect.healthRisk", value: state.tiles.healthRisk[index] },
    { labelKey: "inspect.traffic", value: state.tiles.traffic[index] },
  ];

  return {
    x,
    y,
    index,
    terrainKey: TERRAIN_KEYS[state.tiles.terrain[index]] ?? "terrain.ground",
    zoneKey: ZONE_KEYS[state.tiles.zone[index]],
    owner: state.tiles.owner[index],
    road: (state.tiles.road[index] & NET_PRESENT) !== 0,
    wire: (state.tiles.wire[index] & NET_PRESENT) !== 0,
    pipe: (state.tiles.pipe[index] & NET_PRESENT) !== 0,
    powered: (flags & FLAG_POWERED) !== 0,
    watered: (flags & FLAG_WATERED) !== 0,
    burning: (flags & FLAG_BURNING) !== 0,
    ruined: (flags & FLAG_RUINED) !== 0,
    building: building && {
      id: building.id,
      def: building.def,
      level: building.level,
      occupancy: building.occupancy,
      condition: building.condition,
      owner: building.owner,
    },
    rows,
    // The same bands the overlays paint, in words. A player who cannot tell two
    // shades apart still gets the answer, which is the "never colour alone"
    // rule applied to the inspector rather than only to the map.
    bands: OVERLAY_NAMES.map((name) => ({
      name,
      labelKey: labelKeyFor(name),
      band: bandAt(state, name, index),
      wordKey: BAND_WORD_KEYS[bandAt(state, name, index)] ?? BAND_WORD_KEYS[BAND.NONE],
    })),
  };
}
