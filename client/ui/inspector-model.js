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
  NET_PRESENT, NET_AVENUE,
} from "../constants-mirror.js";
import { OVERLAY_NAMES, labelKeyFor, bandAt, BAND } from "./overlays.js";
// `client/ui/` reads the engine's rules where the HUD has to say what one IS —
// the budget panel and the statistics do the same. Ruling 037 keeps `world/`,
// `render/` and `life/` out of engine/, not the interface.
import { gateStatus } from "../../engine/gates.js";
import { seatName } from "./seats.js";

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
    // A gate's row builds its key from `gateStatus`'s reason (T2), so the list
    // is HERE rather than left for a source scan to miss — the reachability
    // sweep can only see the keys something constructs for it.
    ...GATE_KEYS,
  ];
}

/** Every key `gateOf` can produce: one per reason `engine/gates.js` gives, and
 * the open one. A reason added there without a word here is a station whose
 * inspector row says `gate.somethingNew`. */
export const GATE_KEYS = Object.freeze([
  "gate.live", "gate.noLine", "gate.noSea", "gate.unpowered", "gate.noRoad",
]);

/** The gate row, as keys rather than words: `{ live, reasonKey }` for a gate
 * building, `undefined` for anything else. */
function gateOf(state, building) {
  const status = gateStatus(state, building);
  if (!status) return undefined;
  return {
    live: status.live,
    reasonKey: status.live ? "gate.live" : `gate.${status.reason}`,
  };
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
    { labelKey: "inspect.leisure", value: state.tiles.leisure[index] },
    { labelKey: "inspect.education", value: state.tiles.education[index] },
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
    // Which KIND of road (T1): the inspector is where a player finds out what
    // they are standing on, and an avenue costs and carries differently.
    avenue: (state.tiles.road[index] & NET_AVENUE) !== 0,
    rail: (state.tiles.rail[index] & NET_PRESENT) !== 0,
    wire: (state.tiles.wire[index] & NET_PRESENT) !== 0,
    pipe: (state.tiles.pipe[index] & NET_PRESENT) !== 0,
    powered: (flags & FLAG_POWERED) !== 0,
    watered: (flags & FLAG_WATERED) !== 0,
    burning: (flags & FLAG_BURNING) !== 0,
    ruined: (flags & FLAG_RUINED) !== 0,
    building: building && {
      id: building.id,
      def: building.def,
      // A gate's whole point is whether it is OPEN, and the three ways it can
      // be shut are invisible from the outside (T2): the line stops short, the
      // wire never arrived, or nothing drives to it.
      gate: gateOf(state, building),
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

/** Whose ground is this, for the inspector's one extra row (X3b)?
 *
 * `owner` has been in the report since the inspector was written and **nothing
 * ever showed it** — a field read and dropped, the shape of every dead field
 * this project keeps finding. The item asks for "per-seat gates, ranks and city
 * halls shown as whose they are", and this is the whole of it.
 *
 * `undefined` when the question does not arise: a city with one seat has one
 * answer, and a row reading the same name on every tile is noise — which is
 * what teaches a player to stop reading an inspector. Nature and the commons
 * are not seats either, and naming them would promise somebody to talk to.
 *
 * The BUILDING's owner wins over the ground's: a seat may build on the commons,
 * and what the player is asking about is the thing they clicked.
 */
export function ownerLine(state, report) {
  const seats = (state?.players ?? []).filter((p) => p.seat > 0);
  if (seats.length < 2) return undefined;
  const owner = report?.building?.owner ?? report?.owner;
  if (!seats.some((p) => p.seat === owner)) return undefined;
  return { seat: owner, name: seatName(state, owner) };
}
