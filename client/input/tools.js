// What the toolbar buttons mean.
//
// A tool is the bridge between a gesture and a command: which command it
// issues, whether it paints an area or places one thing, and how a drag is
// interpreted. Nothing here decides whether an action is *allowed* — that is
// the reducer's job and only the reducer's (ruling: permission checks live in
// the reducer). A tool that hid a disallowed action would be lying to the
// player about a rule it does not own.

import {
  CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_PLACE_PIPE,
  CMD_PAINT_ZONE, CMD_DEZONE, CMD_BULLDOZE, CMD_PLACE_BUILDING,
} from "../../engine/commands.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL } from "../constants-mirror.js";

/** How a drag is read.
 *  `line` — the trail of tiles the pointer actually crossed. Roads and pipes
 *           follow the hand, because a player drawing a road means that road.
 *  `rect` — the rectangle between press and release. Zoning a block by dragging
 *           a corner is how every game in this genre has done it, and tracing
 *           the outline of a district by hand would be miserable.
 *  `point` — one tile, whatever the drag did. */
export const DRAG = { LINE: "line", RECT: "rect", POINT: "point" };

// `priceKind` is what `build-commands.price()` needs to quote a stroke before
// it is issued. It is null where the engine has no quote path — zoning is
// charged per tile at commit and there is no staging function to ask. Better a
// missing number than a second implementation of the pricing rules in the
// client, which would drift.
// `key` is the desktop shortcut (§13.3, "keyboard shortcuts for frequent
// tools"). Lower case and compared case-insensitively; digits for the zones
// because R, C and I are already the demand bars and would read as those.
export const TOOLS = {
  road: { command: CMD_PLACE_ROAD, drag: DRAG.LINE, priceKind: "road", icon: "road", key: "r" },
  wire: { command: CMD_PLACE_WIRE, drag: DRAG.LINE, priceKind: "wire", icon: "wire", key: "w" },
  pipe: { command: CMD_PLACE_PIPE, drag: DRAG.LINE, priceKind: "pipe", icon: "pipe", key: "p" },

  zoneResidential: { command: CMD_PAINT_ZONE, drag: DRAG.RECT, zone: ZONE_RESIDENTIAL, priceKind: null, icon: "zoneR", key: "1" },
  zoneCommercial: { command: CMD_PAINT_ZONE, drag: DRAG.RECT, zone: ZONE_COMMERCIAL, priceKind: null, icon: "zoneC", key: "2" },
  zoneIndustrial: { command: CMD_PAINT_ZONE, drag: DRAG.RECT, zone: ZONE_INDUSTRIAL, priceKind: null, icon: "zoneI", key: "3" },
  dezone: { command: CMD_DEZONE, drag: DRAG.RECT, priceKind: null, icon: "dezone", key: "0" },

  bulldoze: { command: CMD_BULLDOZE, drag: DRAG.LINE, priceKind: "bulldoze", icon: "bulldoze", key: "b" },

  // Every placeable building shares one tool; which definition it places is a
  // parameter, so adding a building to data/buildings.json adds it to the game
  // without touching input.
  building: { command: CMD_PLACE_BUILDING, drag: DRAG.POINT, priceKind: null, icon: "building" },
};

/** Tools that send run-length areas. Kept in step with the engine's
 * `AREA_COMMANDS` by a test, because a tool marked one way and a command marked
 * the other sends runs to something that will never read them. */
export function isAreaTool(name) {
  const tool = TOOLS[name];
  return tool !== undefined && tool.drag !== DRAG.POINT;
}

export function toolCommand(name) {
  return TOOLS[name]?.command;
}

/** The command for a completed gesture, ready for `apply`.
 *
 * `runs` for area tools, `x`/`y` for point tools. The actor is the local seat;
 * in multiplayer this same object is what crosses the wire, which is why it
 * carries no screen coordinates and no colours. */
export function buildCommand(name, actor, { runs, x, y, def } = {}) {
  const tool = TOOLS[name];
  if (!tool) return undefined;
  const command = { type: tool.command, actor };
  if (isAreaTool(name)) {
    if (!runs || runs.length === 0) return undefined;
    command.runs = runs;
  } else {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    command.x = x;
    command.y = y;
    command.def = def;
  }
  if (tool.zone !== undefined) command.zone = tool.zone;
  return command;
}

/** The tool a key selects, or undefined. Case-insensitive, and never a match
 * for a key carrying a modifier — Ctrl-R is the browser's, not ours. */
export function toolForKey(key, modified = false) {
  if (modified || typeof key !== "string" || key.length !== 1) return undefined;
  const wanted = key.toLowerCase();
  for (const name of Object.keys(TOOLS)) {
    if (TOOLS[name].key === wanted) return name;
  }
  return undefined;
}
