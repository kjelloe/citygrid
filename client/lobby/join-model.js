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
import { REFUSAL } from "../../shared/protocol.js";
import { sanitiseText } from "../../engine/validate.js";
import { seatsForSize } from "../../engine/options.js";
import { NAME_MAX, optionsFor } from "./options-model.js";

/**
 * What the door's refusal is called, in words the player reads.
 *
 * **Every key spelled as a literal**, because `t(`refused.${reason}`)` is
 * invisible to every "can the interface show this string?" scan in the project
 * — which is how three live inbox labels came to be reported as dead (X3b), and
 * how these eight came to be written in X1b and never shown at all. The door
 * has refused in eight ways since X1b and the page has shown a generic *"the
 * city failed to start"* for every one of them: a full room, a mistyped code
 * and a client two versions behind all read the same, and the one that says
 * **reload the page** is the one a player most needs.
 *
 * Keyed off `REFUSAL` rather than off the strings, so a ninth refusal is a
 * compile-time-ish failure here (`test/lobby-model.test.js` asserts the two
 * lists are the same length) rather than a silent fall-through to the default.
 */
export const REFUSAL_LABELS = Object.freeze({
  [REFUSAL.VERSION_MISMATCH]: "refused.versionMismatch",
  [REFUSAL.BUILD_MISMATCH]: "refused.buildMismatch",
  [REFUSAL.ROOM_FULL]: "refused.roomFull",
  [REFUSAL.SEAT_TAKEN]: "refused.seatTaken",
  [REFUSAL.ROOM_CLOSED]: "refused.roomClosed",
  [REFUSAL.BAD_CODE]: "refused.badCode",
  [REFUSAL.MALFORMED]: "refused.malformed",
  [REFUSAL.BANNED]: "refused.banned",
  [REFUSAL.RATE_LIMIT]: "refused.rateLimit",
  [REFUSAL.BAD_SAVE]: "refused.badSave",
});

/**
 * The key for a refusal the door sent, or `undefined` when it sent something
 * this build has no words for.
 *
 * `undefined` rather than a fallback string: a refusal nobody wrote words for
 * is a bug in this repository, and showing the player a sentence about a
 * DIFFERENT refusal is worse than showing them the generic one — the lesson
 * X1b drew when `ROOM_FULL` was answering for a taken seat.
 */
export function refusalKey(reason) {
  return Object.hasOwn(REFUSAL_LABELS, reason) ? REFUSAL_LABELS[reason] : undefined;
}

/** What the player is told while the page goes and gets the new build (X6). A
 * page that threw itself away with no warning would have lost their typed code
 * for no reason they can see.
 *
 * `status.` and not `refused.`: the door's refusals are a closed list keyed off
 * `REFUSAL`, and `test/i18n.test.js` holds every `refused.*` string to being a
 * code the door can actually give. This is what happens AFTER one. */
export const RELOAD_NOTICE = "status.fetchingBuild";

/**
 * Whether this refusal means the page should go and fetch the new build (X6).
 *
 * `compatible()` has refused `BUILD_MISMATCH` since X1b and the join screen has
 * had the words since X2b; what was missing is the ACTION. A player on a cached
 * old build is told to reload, presses reload, and a cache-first service worker
 * serves them the same build again — so the first deploy after v1.0 would do
 * that to every phone that had ever opened the game. The page has to ask the
 * WORKER to update, and that is only worth doing for this one refusal.
 *
 * **Never on a `dev` build.** `readBuildHash` falls back to `"dev"` when there
 * is no manifest, which is every run from a tree with no precache; a page that
 * reloaded on that would loop, because the reload fetches the same tree and the
 * room refuses again.
 *
 * Never mid-room either, and that one is structural rather than a flag: this is
 * a refusal at the DOOR, so there is no room to be in the middle of (plan §3.9).
 */
export function reloadFor(reason, build) {
  if (reason !== REFUSAL.BUILD_MISMATCH) return false;
  return typeof build === "string" && build.length > 0 && build !== "dev";
}

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
