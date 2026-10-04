// Setting a city up for a gate, from outside it (W5).
//
// A gate that needs the city in a particular state — a wildfire about to strike,
// a treasury of ten — used to reach into `CITY.state` and write it. Since W2
// that object is a MIRROR of the simulation's and the next patch overwrites
// whatever was written into it, so the city has to be set up on the other side
// of the seam.
//
// A SAVE is the way across. `fromSave` refuses a hand-edited file — it
// recomputes the hash and compares — but a save written by `toSave` after
// changing the state in node carries a hash that is correct by construction. So
// a gate exports the city it has, changes it here, and hands the bytes back
// through `CITY.importSave`, which loads them through the seam like any other
// save.
//
// Node only: this is a gate's helper, not the game's.

import { fromSave, toSave } from "../../engine/save.js";
import { DISASTER_WILDFIRE, PHASE_WARNING } from "../../engine/disasters.js";
import { SAVE_VERSION } from "../../shared/protocol.js";

/** The export wrapper `client/storage/saves.js` writes. The version comes from
 * `shared/protocol.js`, where that module gets it too — a second copy of a
 * version number is a drift test waiting to be written. */
const pack = (save) => JSON.stringify({ game: "citygrid", v: SAVE_VERSION, exportedTick: save.tick, save });
const unpack = (text) => JSON.parse(text).save;

/**
 * Arms a disaster in an exported city and returns the export to load back.
 *
 * The phase is `PHASE_WARNING` on purpose: the gate is checking that the game
 * warns and then strikes, which is the whole of §24.10, and starting at the
 * strike would skip the half a player actually sees.
 */
export function armDisaster(exportText, { kind = DISASTER_WILDFIRE, x = 20, y = 20, radius = 4 } = {}) {
  const restored = fromSave(unpack(exportText));
  if (!restored.ok) throw new Error(`the city would not load: ${restored.reason}`);
  const state = restored.state;
  state.disaster.kind = kind;
  state.disaster.phase = PHASE_WARNING;
  state.disaster.ticks = 1;
  state.disaster.x = x;
  state.disaster.y = y;
  state.disaster.radius = radius;
  // `toSave` hashes what it is given, so the file is consistent with itself and
  // `fromSave` will take it.
  return pack(toSave(state));
}
