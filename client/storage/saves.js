// Saving, from the client's side.
//
// `engine/save.js` owns what a save CONTAINS and is verified by the state hash.
// This owns where it goes and when: slots, the autosave policy, and the file
// format for export. Pure, so the only untested part left is IndexedDB itself,
// which is a dozen lines of `put` and `get` in `db.js`.

import { SAVE_VERSION } from "../../shared/protocol.js";
import { TICKS_PER_YEAR } from "../constants-mirror.js";

/** Three manual slots and one autosave.
 *
 * The autosave has its own slot and never touches a manual one. A game that
 * overwrites the city you saved deliberately, with the one you were idly
 * playing, has taken something from you that it cannot give back. */
export const SLOTS = {
  manual: ["slot1", "slot2", "slot3"],
  auto: "autosave",
};

/** One game year between autosaves. In TICKS, not milliseconds: a paused game
 * should never autosave, and a game on fast-forward should not autosave four
 * times as often for the same amount of play. */
export const AUTOSAVE_TICKS = TICKS_PER_YEAR;

export function shouldAutosave(tick, lastSavedTick) {
  if (lastSavedTick === undefined) return true;
  // A tick BEFORE the last save means the player loaded an older game. Without
  // this the subtraction stays negative forever and autosave silently stops for
  // the rest of the session.
  if (tick < lastSavedTick) return true;
  return tick - lastSavedTick >= AUTOSAVE_TICKS;
}

/** Enough to choose between two cities without loading either. */
export function slotSummary(state, slot, savedAt) {
  return {
    slot,
    savedAt,
    tick: state.tick,
    year: Math.floor(state.tick / TICKS_PER_YEAR) + 1,
    population: state.population,
    size: state.width,
    seed: state.options.seed,
    name: state.players[0]?.name ?? "",
  };
}

/** Newest first; slots that hold nothing sink to the bottom. */
export function sortSlots(summaries) {
  return [...summaries].sort((a, b) => (b.savedAt ?? -1) - (a.savedAt ?? -1));
}

/** The export file. Wrapped rather than bare so a file on a disk says what it
 * is — a bare save is an anonymous blob of JSON, and the first thing a player
 * does with an export is lose track of which one it was. */
export function packExport(save) {
  return JSON.stringify({
    game: "citygrid",
    v: SAVE_VERSION,
    exportedTick: save.tick,
    save,
  }, undefined, 0);
}

export function unpackImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not a file this game wrote" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not a file this game wrote" };
  }
  if (parsed.game !== "citygrid") return { ok: false, reason: "not a City Grid save" };
  if (typeof parsed.v !== "number") return { ok: false, reason: "no version" };
  if (!parsed.save || typeof parsed.save !== "object") return { ok: false, reason: "no save in the file" };
  // Everything else — version migration, field checks — is `fromSave`'s job,
  // and it refuses before building any state. Duplicating those checks here
  // would be a second implementation of the save format.
  return { ok: true, data: parsed.save };
}
