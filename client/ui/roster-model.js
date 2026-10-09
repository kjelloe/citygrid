// Who is in the room (X4, slice 5.4).
//
// `CMD_LEAVE` and `CMD_SET_STATUS` have had reducer handlers since Wave 0 and
// no control; their events, `seatLeft` and `seatStatus`, are declared invisible
// in the event census "pending the roster". This is the roster, and it is the
// last two commands' control.
//
// **Built from `state.players`, not from a wire message.** Seat, name and
// status are hashed state and every client already has them, identically — a
// `S2C.ROSTER` carrying the same thing would be a second source for one fact,
// and the two would disagree on the day one of them was forgotten. What the
// state does NOT know is whether a socket is open; that is the server's, it is
// not deterministic, and it belongs with regency.

import { PLAYER_ACTIVE, PLAYER_AFK, PLAYER_REGENT, PLAYER_GONE } from "../../engine/constants.js";
import { PLAYER_COLOURS } from "../render/palette.js";
import { seatName } from "./seats.js";

export const ROSTER_ACTIONS = Object.freeze({
  // **Before the room starts** (X2d). The roster IS the lobby then: it is the
  // only place that lists who is here, so "I am ready" belongs on your own row
  // rather than in a second panel that exists for ninety seconds.
  READY: "ready",
  NOT_READY: "notReady",
  AWAY: "away",
  BACK: "back",
  LEAVE: "leave",
  /** The host's, and only on somebody else's row (X2d). It is not a command:
   * removing a player is the ROOM's business — the seat, the socket and the
   * token are the server's and none of them is in the state — so this rides
   * `C2S.KICK` the way the speed does, and the city learns about it as the
   * `CMD_LEAVE` the room queues on the kicked seat's behalf. */
  REMOVE: "remove",
});

/** Each action's label, spelled out — a key built as `roster.${action}` is
 * invisible to `test/reachability.test.js`'s scan, which is how `inbox.approve`
 * and all seven ping labels read as dead strings while they were on screen. */
export const ROSTER_LABELS = Object.freeze({
  [ROSTER_ACTIONS.READY]: "roster.ready",
  [ROSTER_ACTIONS.NOT_READY]: "roster.notReady",
  [ROSTER_ACTIONS.AWAY]: "roster.away",
  [ROSTER_ACTIONS.BACK]: "roster.back",
  [ROSTER_ACTIONS.LEAVE]: "roster.leave",
  [ROSTER_ACTIONS.REMOVE]: "roster.remove",
});

/** One word per status, and four different ones: playing, away, run by the
 * deputy, gone. A roster that called three of them "here" would answer the
 * question wrongly in the two cases somebody is actually asking it. */
const STATUS_KEYS = {
  [PLAYER_ACTIVE]: "roster.status.active",
  [PLAYER_AFK]: "roster.status.away",
  [PLAYER_REGENT]: "roster.status.regent",
  [PLAYER_GONE]: "roster.status.gone",
};

/**
 * One row per seat, in seat order — the territory legend's rule, and for the
 * same reason: a list that reorders itself between frames cannot be learned.
 *
 * The actions are **your own and only yours — except the host's** (X2d). A
 * button the reducer would refuse is a lie told by the interface (CLAUDE.md:
 * permission checks live in the reducer), and the same goes for one the ROOM
 * would refuse: `host` is passed in rather than guessed, the room checks it
 * again beside the seats it protects, and a guest is offered nothing.
 *
 * A host is not offered their own removal. There is nobody to hand the room to
 * and the city would keep running with no one able to turn the clock, which is
 * a worse state than any a button should be able to reach.
 */
export function rosterFor(state, seat, host = 0, room = undefined) {
  const rows = [];
  // A room nobody passed is a city already playing — singleplayer, and every
  // caller written before X2d. A lobby that waited for itself would be worse
  // than no lobby.
  const waiting = room !== undefined && room.started === false;
  const ready = new Set(room?.ready ?? []);
  for (const player of state?.players ?? []) {
    if (!(player.seat > 0)) continue;
    const you = player.seat === seat;
    const actions = [];
    // Ready first, because before the room starts it is the only thing on the
    // row anybody presses.
    if (waiting && you && player.status !== PLAYER_GONE) {
      actions.push(ready.has(player.seat) ? ROSTER_ACTIONS.NOT_READY : ROSTER_ACTIONS.READY);
    }
    if (you && player.status !== PLAYER_GONE) {
      actions.push(player.status === PLAYER_AFK ? ROSTER_ACTIONS.BACK : ROSTER_ACTIONS.AWAY);
      actions.push(ROSTER_ACTIONS.LEAVE);
    }
    // Somebody who has already gone cannot be removed: there is no socket to
    // close and no seat to free, and a button that does nothing is the defect
    // X2d's speed control was.
    if (!you && host > 0 && seat === host && player.status !== PLAYER_GONE) {
      actions.push(ROSTER_ACTIONS.REMOVE);
    }
    rows.push({
      seat: player.seat,
      name: seatName(state, player.seat),
      colour: PLAYER_COLOURS[player.seat] ?? PLAYER_COLOURS[0],
      status: player.status,
      statusKey: STATUS_KEYS[player.status] ?? STATUS_KEYS[PLAYER_ACTIVE],
      /** Whether this seat has said it is ready (X2d). False in a room that
       * has started, because nothing is waiting for anybody then. */
      ready: waiting && ready.has(player.seat),
      you,
      actions,
    });
  }
  return rows.sort((a, b) => a.seat - b.seat);
}

/**
 * Whether this seat may start the room (X2d).
 *
 * Only the host, and only once: a room where anybody can start the clock is a
 * room where the person still reading the lobby loses the argument, and a
 * button offered in a room that is already playing is the defect X2d's own
 * speed control was — present, pressable and inert.
 *
 * The ROOM enforces it as well (`server/room.js`'s `start`), because a check
 * that exists only in the UI is a suggestion.
 */
export function canStart(seat, host, room) {
  return room !== undefined && room.started === false && host > 0 && seat === host;
}
