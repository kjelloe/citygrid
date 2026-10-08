// Joining a room, as data (X2b, slice 5.2).
//
// The pure half of the join screen: what a typed code means, what the name
// becomes, and whether the button may be pressed. The screen reads it and the
// DOM is the only thing left in `new-game.js`, which is the arrangement
// `options-model.js` already has and the reason node can test any of this.
//
// It does not decide a SEAT. A player who types a code cannot know which seats
// are taken, and the door is the only thing that does — so a hello that names
// no seat means "any", and the room gives out the lowest free one (X2b). A
// screen that asked would be making the player guess, or would need a roster it
// has no way to get before joining, which is X3b's.

import { normaliseRoomCode, ROOM_CODE_LENGTH } from "../../shared/roomcode.js";
import { sanitiseText } from "../../engine/validate.js";
import { seatsForSize } from "../../engine/options.js";
import { NAME_MAX, optionsFor } from "./options-model.js";

/** How many characters the field accepts: the code plus the separator a player
 * is shown, and a little slack for a space — but not so much that it becomes a
 * place to paste a URL. */
export const JOIN_FIELD_MAX = ROOM_CODE_LENGTH + 2;

/**
 * @returns `{ ok: true, join, mayorName }`, or `{ ok: false, reasonKey }` with
 *   a key the screen shows. Two different refusals, because "type something"
 *   and "check what you typed" ask the player to do two different things — the
 *   distinction X1b drew at the door between a full room and a taken seat.
 */
export function joinReady({ code = "", name = "" } = {}) {
  const typed = String(code).trim();
  if (typed.length === 0) return { ok: false, reasonKey: "lobby.join.needCode" };
  const join = normaliseRoomCode(typed);
  if (!join) return { ok: false, reasonKey: "lobby.join.badCode" };
  return { ok: true, join, mayorName: sanitiseText(String(name), NAME_MAX) };
}

/** The options a HOSTED room is generated from (X2c).
 *
 * `optionsFor` defaults to `seats: 1` — the singleplayer part, and the one
 * thing slice 5.2 was always going to change — so hosting with it gave a room
 * one seat and the first guest was refused `ROOM_FULL`. The number comes from
 * `seatsForSize`, the engine's own cap per map size, rather than from a new
 * constant: a bigger region hosts more players for the same reason it always
 * could, and there is one table to change.
 */
export function hostOptions(choices) {
  return optionsFor(choices, seatsForSize(choices?.size ?? 64));
}
